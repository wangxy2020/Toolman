import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_ODL_HYBRID_URL } from '@toolman/shared'
import { pathExists, runCommand, whichBinary } from './office-to-docx/command'
import {
  clearHybridServerProbeCache,
  isHybridServerReachable,
} from './hybrid-server-probe'
import { resolveOdlHybridSettings } from './runtime-app-settings.service'
import { logStructured } from './structured-log.service'

const LOG_TAG = 'odl-hybrid'
const STARTUP_CONSOLE_MESSAGE = 'ODL Hybrid OCR service started'
const HEALTH_WAIT_MS = 3 * 60 * 1000
const HEALTH_POLL_MS = 500
const PROVISION_TIMEOUT_MS = 45 * 60 * 1000
const STOP_GRACE_MS = 5_000

let managedChild: ChildProcess | null = null
let startInflight: Promise<boolean> | null = null
let lastManagedUrl: string | null = null

export function parseOdlHybridPort(url: string): number {
  const normalized = url.trim() || DEFAULT_ODL_HYBRID_URL
  const parsed = new URL(normalized)
  if (parsed.port) return Number(parsed.port)
  return parsed.protocol === 'https:' ? 443 : 80
}

function hybridBinaryName(): string {
  return process.platform === 'win32' ? 'opendataloader-pdf-hybrid.exe' : 'opendataloader-pdf-hybrid'
}

function venvHybridPath(venvRoot: string): string {
  return process.platform === 'win32'
    ? join(venvRoot, 'Scripts', hybridBinaryName())
    : join(venvRoot, 'bin', hybridBinaryName())
}

function venvPythonPath(venvRoot: string): string {
  return process.platform === 'win32'
    ? join(venvRoot, 'Scripts', 'python.exe')
    : join(venvRoot, 'bin', 'python3')
}

function managedVenvRoot(): string {
  return join(app.getPath('userData'), 'venvs', 'odl-hybrid')
}

async function isExecutable(path: string): Promise<boolean> {
  if (!(await pathExists(path))) return false
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return process.platform === 'win32'
  }
}

async function resolvePythonForProvision(): Promise<string | null> {
  const envPython = process.env.TOOLMAN_ODL_HYBRID_PYTHON?.trim()
  if (envPython && (await isExecutable(envPython))) return envPython

  const candidates = [
    '/opt/homebrew/bin/python3.12',
    '/usr/local/bin/python3.12',
    'python3.12',
    'python3',
  ]
  for (const candidate of candidates) {
    if (candidate.includes('/')) {
      if (await isExecutable(candidate)) return candidate
      continue
    }
    const resolved = await whichBinary(candidate)
    if (resolved && (await isExecutable(resolved))) return resolved
  }
  return null
}

async function resolveOdlHybridExecutable(): Promise<string | null> {
  const envBin = process.env.TOOLMAN_ODL_HYBRID_BIN?.trim()
  if (envBin && (await isExecutable(envBin))) return envBin

  const candidates = [
    venvHybridPath(managedVenvRoot()),
    join(homedir(), '.venvs', 'odl-hybrid', process.platform === 'win32' ? 'Scripts' : 'bin', hybridBinaryName()),
  ]

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate
  }

  const onPath = await whichBinary(
    process.platform === 'win32' ? 'opendataloader-pdf-hybrid.exe' : 'opendataloader-pdf-hybrid',
  )
  if (onPath && (await isExecutable(onPath))) return onPath

  return null
}

async function provisionManagedOdlHybridVenv(): Promise<string | null> {
  const existing = await resolveOdlHybridExecutable()
  if (existing) return existing

  const venvRoot = managedVenvRoot()
  const hybridBin = venvHybridPath(venvRoot)
  if (await isExecutable(hybridBin)) return hybridBin

  const python = await resolvePythonForProvision()
  if (!python) {
    logStructured(LOG_TAG, 'warn', 'no Python 3.12+ found to provision ODL Hybrid venv')
    return null
  }

  logStructured(LOG_TAG, 'info', `provisioning ODL Hybrid venv at ${venvRoot}`)
  await mkdir(venvRoot, { recursive: true })

  const venvPython = venvPythonPath(venvRoot)
  if (!(await pathExists(venvPython))) {
    await runCommand(python, ['-m', 'venv', venvRoot], { timeoutMs: 120_000 })
  }
  await runCommand(venvPython, ['-m', 'pip', 'install', '-U', 'pip'], { timeoutMs: 300_000 })
  await runCommand(venvPython, ['-m', 'pip', 'install', '-U', 'opendataloader-pdf[hybrid]'], {
    timeoutMs: PROVISION_TIMEOUT_MS,
  })

  if (await isExecutable(hybridBin)) {
    logStructured(LOG_TAG, 'info', `ODL Hybrid installed at ${hybridBin}`)
    return hybridBin
  }
  return null
}

function buildHybridArgs(port: number): string[] {
  const settings = resolveOdlHybridSettings()
  const args = ['--port', String(port)]
  if (settings.hancomAiOcrStrategy === 'force' || settings.backend === 'docling-fast') {
    args.push('--force-ocr')
  }
  return args
}

async function waitForHybridHealth(url: string, timeoutMs = HEALTH_WAIT_MS): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    clearHybridServerProbeCache()
    if (await isHybridServerReachable(url, 1_500, { bypassCache: true })) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_MS))
  }
  return false
}

function attachManagedProcessExitHandler(child: ChildProcess): void {
  child.on('exit', (code, signal) => {
    if (managedChild === child) {
      managedChild = null
      lastManagedUrl = null
    }
    if (code !== 0 && code !== null) {
      logStructured(LOG_TAG, 'warn', `ODL Hybrid exited code=${code} signal=${signal ?? ''}`)
    }
  })
}

async function spawnManagedHybridServer(url: string, executable: string): Promise<boolean> {
  const port = parseOdlHybridPort(url)
  const args = buildHybridArgs(port)

  const child = spawn(executable, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
  })
  managedChild = child
  lastManagedUrl = url
  attachManagedProcessExitHandler(child)

  const healthy = await waitForHybridHealth(url)
  if (!healthy) {
    logStructured(LOG_TAG, 'warn', `ODL Hybrid failed health check at ${url}`)
    await stopManagedOdlHybridServer()
    return false
  }

  logStructured(LOG_TAG, 'info', STARTUP_CONSOLE_MESSAGE)
  return true
}

export async function stopManagedOdlHybridServer(): Promise<void> {
  startInflight = null
  const child = managedChild
  if (!child || child.killed) {
    managedChild = null
    lastManagedUrl = null
    return
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL')
      resolve()
    }, STOP_GRACE_MS)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })

  managedChild = null
  lastManagedUrl = null
  clearHybridServerProbeCache()
}

/** Start or attach to the local hybrid server when settings enable ODL Hybrid OCR. */
export async function ensureOdlHybridServerRunning(
  url = resolveOdlHybridSettings().url.trim() || DEFAULT_ODL_HYBRID_URL,
): Promise<boolean> {
  const settings = resolveOdlHybridSettings()
  if (!settings.enabled) return false

  const normalized = url.trim() || DEFAULT_ODL_HYBRID_URL
  if (await isHybridServerReachable(normalized, undefined, { bypassCache: true })) {
    return true
  }

  if (startInflight) return startInflight

  startInflight = (async () => {
    try {
      if (managedChild && !managedChild.killed && lastManagedUrl === normalized) {
        return await waitForHybridHealth(normalized)
      }

      if (managedChild && !managedChild.killed && lastManagedUrl !== normalized) {
        await stopManagedOdlHybridServer()
      }

      let executable = await resolveOdlHybridExecutable()
      if (!executable) {
        executable = await provisionManagedOdlHybridVenv()
      }
      if (!executable) {
        logStructured(
          LOG_TAG,
          'warn',
          'ODL Hybrid executable not found — enable will auto-install when Python 3.12+ is available',
        )
        return false
      }

      return await spawnManagedHybridServer(normalized, executable)
    } finally {
      startInflight = null
    }
  })()

  return startInflight
}

export async function reconcileOdlHybridServer(_reason: string): Promise<void> {
  const settings = resolveOdlHybridSettings()
  if (!settings.enabled) {
    await stopManagedOdlHybridServer()
    return
  }

  void ensureOdlHybridServerRunning(settings.url).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    logStructured(LOG_TAG, 'warn', `reconcile failed: ${message}`)
  })
}

export async function shutdownOdlHybridServer(): Promise<void> {
  await stopManagedOdlHybridServer()
}
