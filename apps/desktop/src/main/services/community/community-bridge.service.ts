import { app } from 'electron'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { CommunityHubMode } from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'

import {
  COMMUNITY_HUB_DEFAULT_PORT,
  COMMUNITY_HUB_HOST,
  buildCommunityHubBaseUrl,
  getCommunityDataDir,
  getCommunityHubPortFilePath,
  resolveCommunityHubBinaryPath,
} from './community-paths'
import { DEFAULT_LOCAL_IDENTITY_ID } from '../local-identity'
import { CommunityHttpClient } from './community-http.client'
import { resolveCommunityHubAuth } from './community-hub-auth.service'
import { getHubJwtSecret } from '../auth/hub-jwt-secret.service'
import {
  ensureDefaultCommunityHubConfig,
  getCommunityHubMode,
  readCommunityHubConfig,
  resolveCommunityHubBaseUrl,
} from './community-hub.config'
import { hasAnyCommunityHubCache } from './community-hub-cache.service'

export interface CommunityHubPortFile {
  host: string
  port: number
  pid: number
  startedAt: number
}

export interface CommunityHubStatus {
  running: boolean
  mode: CommunityHubMode
  port: number | null
  host: string
  baseUrl: string | null
  binaryPath: string | null
  offlineReadOnly: boolean
  error?: string
}

const HEALTH_POLL_INTERVAL_MS = 200
const HEALTH_POLL_MAX_ATTEMPTS = 75
const HUB_START_MAX_ATTEMPTS = 3

let childProcess: ChildProcess | null = null
let httpClient: CommunityHttpClient | null = null
let currentStatus: CommunityHubStatus = {
  running: false,
  mode: 'local',
  port: null,
  host: COMMUNITY_HUB_HOST,
  baseUrl: null,
  binaryPath: null,
  offlineReadOnly: false,
}

function log(message: string, error?: unknown): void {
  if (error !== undefined) {
    logStructured('community.hub', 'error', `${message}`, { detail: error })
    const errMessage = toErrorMessage(error, String(error))
    recordDiagnosticEvent('community-hub', 'error', `${message}: ${errMessage}`)
    return
  }
  logStructured('community.hub', 'info', `${message}`)
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
  const mode = getCommunityHubMode()
  currentStatus = {
    running: false,
    mode,
    port: null,
    host: mode === 'remote' ? '' : COMMUNITY_HUB_HOST,
    baseUrl: mode === 'remote' ? resolveCommunityHubBaseUrl() : null,
    binaryPath: currentStatus.binaryPath,
    offlineReadOnly: mode === 'remote' && hasAnyCommunityHubCache(),
    error: mode === 'remote' ? currentStatus.error : undefined,
  }
  if (mode === 'local') {
    await removeCommunityHubPortFile()
  }
}

export function markCommunityHubOfflineReadOnly(error?: string): void {
  currentStatus = {
    ...currentStatus,
    running: httpClient != null,
    offlineReadOnly: hasAnyCommunityHubCache(),
    error: error ?? currentStatus.error ?? '官方 Hub 暂不可达，已切换为本地缓存只读',
  }
}

export function clearCommunityHubOfflineReadOnly(): void {
  if (!httpClient || !currentStatus.offlineReadOnly) return
  currentStatus = {
    ...currentStatus,
    running: true,
    offlineReadOnly: false,
    error: undefined,
  }
}

export async function recoverCommunityHubConnection(): Promise<CommunityHubStatus> {
  await refreshCommunityHubClientIfNeeded()
  return getCommunityHubStatus()
}

/** Re-attach when the cached client points at a dead port (common in dual-instance dev). */
export async function refreshCommunityHubClientIfNeeded(): Promise<boolean> {
  if (httpClient) {
    try {
      const health = await httpClient.health()
      if (health.status === 'healthy') {
        if (!currentStatus.running || currentStatus.offlineReadOnly) {
          currentStatus = {
            ...currentStatus,
            running: true,
            offlineReadOnly: false,
            error: undefined,
          }
        }
        return true
      }
    } catch {
      // stale client — re-attach below
    }
  }

  httpClient = null

  if (childProcess && currentStatus.port !== null) {
    const client = new CommunityHttpClient({
      port: currentStatus.port,
      host: COMMUNITY_HUB_HOST,
      resolveAuth: resolveCommunityHubAuth,
    })
    try {
      const health = await client.health()
      if (health.status === 'healthy') {
        httpClient = client
        currentStatus = {
          ...currentStatus,
          running: true,
          offlineReadOnly: false,
          error: undefined,
        }
        return true
      }
    } catch {
      // owned sidecar may have exited
    }
  }

  const attached = await tryAttachRunningCommunityHub()
  return attached !== null && httpClient !== null
}

async function connectRemoteCommunityHub(baseUrl: string): Promise<CommunityHubStatus> {
  const client = new CommunityHttpClient({
    baseUrl,
    resolveAuth: resolveCommunityHubAuth,
  })

  try {
    await waitForHealth(client)
    httpClient = client
    currentStatus = {
      running: true,
      mode: 'remote',
      port: null,
      host: '',
      baseUrl,
      binaryPath: null,
      offlineReadOnly: false,
    }
    log(`connected to remote hub at ${baseUrl}`)
    return getCommunityHubStatus()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    const offlineReadOnly = hasAnyCommunityHubCache()
    httpClient = null
    currentStatus = {
      running: false,
      mode: 'remote',
      port: null,
      host: '',
      baseUrl,
      binaryPath: null,
      offlineReadOnly,
      error: offlineReadOnly
        ? `官方 Hub 暂不可达，已切换为本地缓存只读（${message}）`
        : `无法连接官方 Hub：${message}`,
    }
    recordDiagnosticEvent('community-hub', 'warn', currentStatus.error ?? message)
    return getCommunityHubStatus()
  }
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

      const rateLimitRpm = health.rate_limit_rpm ?? 0
      if (!app.isPackaged && rateLimitRpm > 0) {
        log(
          `skipping attach to hub on port ${port} (rate_limit_rpm=${rateLimitRpm}); dev will spawn an unlimited hub instead`,
        )
        continue
      }

      httpClient = client
      currentStatus = {
        running: true,
        mode: 'local',
        port,
        host: COMMUNITY_HUB_HOST,
        baseUrl: buildCommunityHubBaseUrl(port),
        binaryPath,
        offlineReadOnly: false,
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
      mode: 'local',
      port: null,
      host: COMMUNITY_HUB_HOST,
      baseUrl: null,
      binaryPath: null,
      offlineReadOnly: false,
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
      COMMUNITY_HUB_DEFAULT_IDENTITY_ID:
        process.env.COMMUNITY_HUB_DEFAULT_IDENTITY_ID?.trim() || DEFAULT_LOCAL_IDENTITY_ID,
      COMMUNITY_HUB_DEV_TEST_ROLES:
        process.env.COMMUNITY_HUB_DEV_TEST_ROLES ??
        (app.isPackaged ? 'false' : 'true'),
      COMMUNITY_HUB_JWT_SECRET: jwtSecret,
      COMMUNITY_HUB_REQUIRE_REVIEW:
        process.env.COMMUNITY_HUB_REQUIRE_REVIEW ?? (app.isPackaged ? 'true' : 'true'),
      COMMUNITY_HUB_RATE_LIMIT_RPM:
        process.env.COMMUNITY_HUB_RATE_LIMIT_RPM ?? '0',
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
      lastError = toErrorMessage(error, String(error))
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
      mode: 'local',
      port,
      host: COMMUNITY_HUB_HOST,
      baseUrl: buildCommunityHubBaseUrl(port),
      binaryPath,
      offlineReadOnly: false,
    }

    log(`sidecar ready at ${currentStatus.baseUrl}`)
    return getCommunityHubStatus()
  }

  currentStatus = {
    running: false,
    mode: 'local',
    port: null,
    host: COMMUNITY_HUB_HOST,
    baseUrl: null,
    binaryPath,
    offlineReadOnly: false,
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
  if (getCommunityHubMode() === 'remote') {
    httpClient = null
    currentStatus = {
      ...currentStatus,
      running: false,
    }
    return
  }
  await stopCommunityHub()
}

export async function bootstrapCommunityHub(): Promise<CommunityHubStatus> {
  if (!app.isReady()) {
    await app.whenReady()
  }

  ensureDefaultCommunityHubConfig()
  const config = readCommunityHubConfig()

  if (config.mode === 'remote') {
    const baseUrl = resolveCommunityHubBaseUrl(config)
    if (!baseUrl) {
      currentStatus = {
        running: false,
        mode: 'remote',
        port: null,
        host: '',
        baseUrl: null,
        binaryPath: null,
        offlineReadOnly: false,
        error: '远程 Hub 未配置 baseUrl',
      }
      return getCommunityHubStatus()
    }
    return connectRemoteCommunityHub(baseUrl)
  }

  await restartCommunityHubIfBinaryUpdated()
  return startCommunityHub()
}

async function restartCommunityHubIfBinaryUpdated(): Promise<void> {
  const binaryPath = resolveCommunityHubBinaryPath()
  if (!binaryPath) return

  const portFile = await readCommunityHubPortFile()
  if (!portFile?.pid) return

  if (portFile.port) {
    const client = new CommunityHttpClient({
      port: portFile.port,
      host: COMMUNITY_HUB_HOST,
      resolveAuth: resolveCommunityHubAuth,
    })
    try {
      const health = await client.health()
      if (health.status === 'healthy') {
        return
      }
    } catch {
      // Hub not responding — only restart if this process owns the sidecar.
    }
  }

  if (childProcess?.pid !== portFile.pid) {
    return
  }

  try {
    const binaryStat = await stat(binaryPath)
    if (binaryStat.mtimeMs <= portFile.startedAt) return

    log('detected newer community hub binary, restarting owned sidecar')
    try {
      process.kill(portFile.pid, 'SIGTERM')
    } catch {
      // sidecar may already be stopped
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  } catch (error) {
    log('failed to inspect community hub binary for restart', error)
  } finally {
    if (childProcess?.pid === portFile.pid) {
      await removeCommunityHubPortFile()
    }
  }
}
