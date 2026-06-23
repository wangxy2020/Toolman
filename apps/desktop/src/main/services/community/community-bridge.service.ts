import { app } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  COMMUNITY_HUB_DEFAULT_PORT,
  COMMUNITY_HUB_HOST,
  COMMUNITY_HUB_IDENTITY_ID,
  buildCommunityHubBaseUrl,
  getCommunityDataDir,
  getCommunityHubPortFilePath,
  resolveCommunityHubBinaryPath,
} from './community-paths'
import { CommunityHttpClient } from './community-http.client'
import { resolveCommunityHubAuth } from './community-hub-auth.service'
import { getHubJwtSecret } from '../auth/hub-jwt-secret.service'

export interface CommunityHubPortFile {
  host: string
  port: number
  pid: number
  startedAt: number
}

export interface CommunityHubStatus {
  running: boolean
  port: number | null
  host: string
  baseUrl: string | null
  binaryPath: string | null
  error?: string
}

const HEALTH_POLL_INTERVAL_MS = 200
const HEALTH_POLL_MAX_ATTEMPTS = 75
const HUB_START_MAX_ATTEMPTS = 3

let childProcess: ChildProcess | null = null
let httpClient: CommunityHttpClient | null = null
let currentStatus: CommunityHubStatus = {
  running: false,
  port: null,
  host: COMMUNITY_HUB_HOST,
  baseUrl: null,
  binaryPath: null,
}

function log(message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(`[community-hub] ${message}`, error)
    return
  }
  console.log(`[community-hub] ${message}`)
}

export function getCommunityHubStatus(): CommunityHubStatus {
  return { ...currentStatus }
}

export function getCommunityHubBaseUrl(): string | null {
  return currentStatus.baseUrl
}

export function isCommunityHubRunning(): boolean {
  return currentStatus.running
}

export function getCommunityHttpClient(): CommunityHttpClient | null {
  return httpClient
}

export async function readCommunityHubPortFile(
  filePath = getCommunityHubPortFilePath(),
): Promise<CommunityHubPortFile | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as CommunityHubPortFile
  } catch {
    return null
  }
}

export async function writeCommunityHubPortFile(
  value: CommunityHubPortFile,
  filePath = getCommunityHubPortFilePath(),
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export async function removeCommunityHubPortFile(
  filePath = getCommunityHubPortFilePath(),
): Promise<void> {
  try {
    await rm(filePath, { force: true })
  } catch {
    // ignore missing file
  }
}

export async function allocateCommunityHubPort(
  preferred = COMMUNITY_HUB_DEFAULT_PORT,
): Promise<number> {
  const preferredPort = await tryListenOnPort(preferred)
  if (preferredPort !== null) {
    return preferredPort
  }
  const ephemeralPort = await tryListenOnPort(0)
  if (ephemeralPort !== null) {
    return ephemeralPort
  }
  throw new Error('failed to allocate community hub port')
}

function tryListenOnPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(null))
    server.listen(port, COMMUNITY_HUB_HOST, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      server.close(() => resolve(boundPort))
    })
  })
}

async function waitForHealth(client: CommunityHttpClient): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < HEALTH_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const health = await client.health()
      if (health.status === 'healthy') {
        return
      }
      lastError = new Error(`unexpected health status: ${health.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('community hub health check timed out')
}

function ensureHubBinarySigned(binaryPath: string): void {
  if (process.platform !== 'darwin') return
  const result = spawnSync('codesign', ['--force', '--sign', '-', binaryPath], {
    stdio: 'ignore',
  })
  if (result.status !== 0) {
    log('failed to ad-hoc sign community hub binary; macOS may block launch')
  }
}

function attachProcessLogging(process: ChildProcess): void {
  process.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) log(text)
  })
  process.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) log(text, undefined)
  })
  process.on('exit', (code, signal) => {
    if (currentStatus.running) {
      log(`sidecar exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
      void markStopped()
    }
  })
}

async function markStopped(): Promise<void> {
  childProcess = null
  httpClient = null
  currentStatus = {
    running: false,
    port: null,
    host: COMMUNITY_HUB_HOST,
    baseUrl: null,
    binaryPath: currentStatus.binaryPath,
  }
  await removeCommunityHubPortFile()
}

async function tryAttachRunningCommunityHub(): Promise<CommunityHubStatus | null> {
  const binaryPath = resolveCommunityHubBinaryPath()
  const portCandidates = new Set<number>()

  const portFile = await readCommunityHubPortFile()
  if (portFile?.port) {
    portCandidates.add(portFile.port)
  }
  portCandidates.add(COMMUNITY_HUB_DEFAULT_PORT)

  for (const port of portCandidates) {
    const client = new CommunityHttpClient({
      port,
      host: COMMUNITY_HUB_HOST,
      resolveAuth: resolveCommunityHubAuth,
    })

    try {
      const health = await client.health()
      if (health.status !== 'healthy') {
        continue
      }

      httpClient = client
      currentStatus = {
        running: true,
        port,
        host: COMMUNITY_HUB_HOST,
        baseUrl: buildCommunityHubBaseUrl(port),
        binaryPath,
      }
      log(`attached to existing sidecar at ${currentStatus.baseUrl}`)
      return getCommunityHubStatus()
    } catch {
      // try next candidate port
    }
  }

  return null
}

export async function startCommunityHub(): Promise<CommunityHubStatus> {
  if (currentStatus.running && httpClient && currentStatus.port !== null) {
    return getCommunityHubStatus()
  }

  const attached = await tryAttachRunningCommunityHub()
  if (attached) {
    return attached
  }

  if (currentStatus.running && childProcess && currentStatus.port !== null) {
    return getCommunityHubStatus()
  }

  const binaryPath = resolveCommunityHubBinaryPath()
  if (!binaryPath) {
    const error =
      'toolman-community-hub binary not found. Run: pnpm --filter @toolman/desktop build:community-hub'
    currentStatus = {
      running: false,
      port: null,
      host: COMMUNITY_HUB_HOST,
      baseUrl: null,
      binaryPath: null,
      error,
    }
    log(error)
    return getCommunityHubStatus()
  }

  const dataDir = getCommunityDataDir()
  await mkdir(dataDir, { recursive: true })

  ensureHubBinarySigned(binaryPath)

  const jwtSecret = await getHubJwtSecret()
  let lastError = 'community hub health check timed out'

  for (let attempt = 0; attempt < HUB_START_MAX_ATTEMPTS; attempt += 1) {
    const preferredPort = attempt === 0 ? COMMUNITY_HUB_DEFAULT_PORT : 0
    const port = await allocateCommunityHubPort(preferredPort)
    const env = {
      ...process.env,
      COMMUNITY_HUB_DATA_DIR: dataDir,
      COMMUNITY_HUB_PORT: String(port),
      COMMUNITY_HUB_DEFAULT_IDENTITY_ID: COMMUNITY_HUB_IDENTITY_ID,
      COMMUNITY_HUB_JWT_SECRET: jwtSecret,
      RUST_LOG: process.env.RUST_LOG ?? 'toolman_community_hub=info',
    }

    const processHandle = spawn(binaryPath, [], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    childProcess = processHandle
    attachProcessLogging(processHandle)

    const client = new CommunityHttpClient({
      port,
      host: COMMUNITY_HUB_HOST,
      resolveAuth: resolveCommunityHubAuth,
    })

    try {
      await waitForHealth(client)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      log(
        `failed to start sidecar on port ${port} (attempt ${attempt + 1}/${HUB_START_MAX_ATTEMPTS})`,
        error,
      )
      await stopCommunityHub(processHandle)
      continue
    }

    const portFile: CommunityHubPortFile = {
      host: COMMUNITY_HUB_HOST,
      port,
      pid: processHandle.pid ?? -1,
      startedAt: Date.now(),
    }
    await writeCommunityHubPortFile(portFile)

    httpClient = client
    currentStatus = {
      running: true,
      port,
      host: COMMUNITY_HUB_HOST,
      baseUrl: buildCommunityHubBaseUrl(port),
      binaryPath,
    }

    log(`sidecar ready at ${currentStatus.baseUrl}`)
    return getCommunityHubStatus()
  }

  currentStatus = {
    running: false,
    port: null,
    host: COMMUNITY_HUB_HOST,
    baseUrl: null,
    binaryPath,
    error: lastError,
  }
  return getCommunityHubStatus()
}

async function stopCommunityHub(target = childProcess): Promise<void> {
  if (!target) {
    await markStopped()
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (!target.killed) {
        target.kill('SIGKILL')
      }
      resolve()
    }, 5_000)

    target.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    if (target.pid) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(target.pid), '/t', '/f'], { stdio: 'ignore' })
      } else {
        target.kill('SIGTERM')
      }
    } else {
      clearTimeout(timeout)
      resolve()
    }
  })

  if (target === childProcess) {
    await markStopped()
  }
}

export async function shutdownCommunityHub(): Promise<void> {
  await stopCommunityHub()
}

async function restartCommunityHubIfBinaryUpdated(): Promise<void> {
  const binaryPath = resolveCommunityHubBinaryPath()
  if (!binaryPath) return

  const portFile = await readCommunityHubPortFile()
  if (!portFile?.pid) return

  try {
    const binaryStat = await stat(binaryPath)
    if (binaryStat.mtimeMs <= portFile.startedAt) return

    log('detected newer community hub binary, restarting sidecar')
    try {
      process.kill(portFile.pid, 'SIGTERM')
    } catch {
      // sidecar may already be stopped
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  } catch (error) {
    log('failed to inspect community hub binary for restart', error)
  } finally {
    await removeCommunityHubPortFile()
  }
}

export async function bootstrapCommunityHub(): Promise<CommunityHubStatus> {
  if (!app.isReady()) {
    await app.whenReady()
  }
  await restartCommunityHubIfBinaryUpdated()
  return startCommunityHub()
}
