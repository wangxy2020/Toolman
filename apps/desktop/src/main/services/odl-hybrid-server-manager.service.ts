import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_ODL_HYBRID_URL, type OdlHybridSettings } from '@toolman/shared'
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
const RAPID_OCR_INSTALL_TIMEOUT_MS = 10 * 60 * 1000

export type OdlHybridOcrEngine = 'ocrmac' | 'rapidocr' | 'easyocr'

export type OdlHybridOcrChoice = {
  engine: OdlHybridOcrEngine
  lang: string
  device?: 'mps' | 'cpu'
}

/** Apple Vision via Docling ocrmac — fastest Chinese Fast OCR on M2. */
export const MAC_VISION_ODL_HYBRID_OCR: OdlHybridOcrChoice = {
  engine: 'ocrmac',
  lang: 'zh-Hans,en-US',
  device: 'mps',
}
/** RapidOCR PP-OCRv6. Requires onnxruntime. */
export const RAPID_ODL_HYBRID_OCR: OdlHybridOcrChoice = {
  engine: 'rapidocr',
  lang: 'chinese',
  device: 'mps',
}
/** EasyOCR Simplified Chinese. Last resort — default EasyOCR is English-only. */
export const FALLBACK_ODL_HYBRID_OCR: OdlHybridOcrChoice = { engine: 'easyocr', lang: 'ch_sim,en' }
export const PREFERRED_ODL_HYBRID_OCR: OdlHybridOcrChoice =
  process.platform === 'darwin' ? MAC_VISION_ODL_HYBRID_OCR : RAPID_ODL_HYBRID_OCR

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
  await ensureOcrMacPackages(venvPython)
  await ensureRapidOcrPackages(venvPython)

  if (await isExecutable(hybridBin)) {
    logStructured(LOG_TAG, 'info', `ODL Hybrid installed at ${hybridBin}`)
    return hybridBin
  }
  return null
}

function pythonBesideHybrid(hybridBin: string): string {
  const dir = dirname(hybridBin)
  return process.platform === 'win32' ? join(dir, 'python.exe') : join(dir, 'python3')
}

async function pythonCanImport(python: string, expression: string): Promise<boolean> {
  try {
    await runCommand(python, ['-c', expression], { timeoutMs: 30_000 })
    return true
  } catch {
    return false
  }
}

async function pythonCanImportOcrMac(python: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  return pythonCanImport(python, 'import ocrmac')
}

async function pythonCanImportRapidOcr(python: string): Promise<boolean> {
  return pythonCanImport(python, 'import rapidocr, onnxruntime')
}

async function ensureOcrMacPackages(python: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  if (await pythonCanImportOcrMac(python)) return true
  try {
    logStructured(LOG_TAG, 'info', `installing ocrmac into ${python} for Apple Vision OCR`)
    await runCommand(python, ['-m', 'pip', 'install', '-U', 'ocrmac'], {
      timeoutMs: RAPID_OCR_INSTALL_TIMEOUT_MS,
    })
    return pythonCanImportOcrMac(python)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured(LOG_TAG, 'warn', `ocrmac install failed: ${message}`)
    return false
  }
}

async function ensureRapidOcrPackages(python: string): Promise<boolean> {
  if (await pythonCanImportRapidOcr(python)) return true
  try {
    logStructured(LOG_TAG, 'info', `installing RapidOCR into ${python} for Chinese scanned PDFs`)
    await runCommand(python, ['-m', 'pip', 'install', '-U', 'rapidocr', 'onnxruntime'], {
      timeoutMs: RAPID_OCR_INSTALL_TIMEOUT_MS,
    })
    return pythonCanImportRapidOcr(python)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured(LOG_TAG, 'warn', `RapidOCR install failed: ${message}`)
    return false
  }
}

export function shouldForceOdlHybridOcr(settings: OdlHybridSettings): boolean {
  return settings.hancomAiOcrStrategy === 'force' || settings.backend === 'docling-fast'
}

export function buildOdlHybridServerArgs(
  port: number,
  options?: { forceOcr?: boolean; ocr?: OdlHybridOcrChoice },
): string[] {
  const args = ['--port', String(port)]
  if (options?.forceOcr === false) return args
  const ocr = options?.ocr ?? PREFERRED_ODL_HYBRID_OCR
  args.push('--force-ocr', '--ocr-engine', ocr.engine, '--ocr-lang', ocr.lang)
  if (ocr.device) args.push('--device', ocr.device)
  return args
}

export async function listHybridOcrAttempts(hybridBin: string): Promise<OdlHybridOcrChoice[]> {
  const python = pythonBesideHybrid(hybridBin)
  const attempts: OdlHybridOcrChoice[] = []
  if (await pathExists(python)) {
    if (await ensureOcrMacPackages(python)) attempts.push(MAC_VISION_ODL_HYBRID_OCR)
    if (await ensureRapidOcrPackages(python)) attempts.push(RAPID_ODL_HYBRID_OCR)
  }
  attempts.push(FALLBACK_ODL_HYBRID_OCR)
  return attempts
}

async function waitForHybridHealth(
  url: string,
  timeoutMs = HEALTH_WAIT_MS,
  shouldAbort?: () => boolean,
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (shouldAbort?.()) return false
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

async function killManagedChild(): Promise<void> {
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

async function terminateListenersOnPort(port: number): Promise<void> {
  if (process.platform === 'win32') return
  try {
    const { stdout } = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      timeoutMs: 5_000,
    })
    for (const pidText of stdout.split(/\s+/).filter(Boolean)) {
      const pid = Number(pidText)
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // Already gone.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  } catch {
    // No listener, or lsof unavailable.
  }
}

async function spawnHybridAttempt(
  url: string,
  executable: string,
  args: string[],
): Promise<boolean> {
  let stderr = ''
  let exited = false
  const child = spawn(executable, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  managedChild = child
  lastManagedUrl = url
  attachManagedProcessExitHandler(child)

  const exitFailed = new Promise<false>((resolve) => {
    child.once('exit', (code) => {
      exited = true
      if (code !== 0 && code !== null) {
        logStructured(
          LOG_TAG,
          'warn',
          `ODL Hybrid exited during startup code=${code}: ${stderr.trim().slice(-800)}`,
        )
      }
      resolve(false)
    })
  })

  const healthy = await Promise.race([
    waitForHybridHealth(url, HEALTH_WAIT_MS, () => exited),
    exitFailed,
  ])
  if (healthy && !exited) {
    const engine = args.includes('ocrmac')
      ? 'ocrmac'
      : args.includes('rapidocr')
        ? 'rapidocr'
        : args.includes('easyocr')
          ? 'easyocr'
          : 'default'
    logStructured(LOG_TAG, 'info', `${STARTUP_CONSOLE_MESSAGE} (${engine} ${args.join(' ')})`)
    return true
  }

  logStructured(LOG_TAG, 'warn', `ODL Hybrid failed health check at ${url} args=${args.join(' ')}`)
  await killManagedChild()
  return false
}

async function spawnManagedHybridServer(url: string, executable: string): Promise<boolean> {
  const port = parseOdlHybridPort(url)
  const attempts = await listHybridOcrAttempts(executable)
  for (const ocr of attempts) {
    const args = buildOdlHybridServerArgs(port, { forceOcr: true, ocr })
    if (await spawnHybridAttempt(url, executable, args)) return true
  }
  return false
}

export async function stopManagedOdlHybridServer(): Promise<void> {
  startInflight = null
  await killManagedChild()
}

/** Start or attach to the local hybrid server when settings enable ODL Hybrid OCR. */
export async function ensureOdlHybridServerRunning(
  url = resolveOdlHybridSettings().url.trim() || DEFAULT_ODL_HYBRID_URL,
): Promise<boolean> {
  const settings = resolveOdlHybridSettings()
  if (!settings.enabled) return false

  const normalized = url.trim() || DEFAULT_ODL_HYBRID_URL
  if (startInflight) return startInflight

  startInflight = (async () => {
    try {
      if (
        managedChild &&
        !managedChild.killed &&
        lastManagedUrl === normalized &&
        (await isHybridServerReachable(normalized, undefined, { bypassCache: true }))
      ) {
        return true
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

      const port = parseOdlHybridPort(normalized)
      await killManagedChild()
      if (await isHybridServerReachable(normalized, undefined, { bypassCache: true })) {
        logStructured(
          LOG_TAG,
          'info',
          `replacing Hybrid listener on port ${port} so Chinese OCR flags take effect`,
        )
        await terminateListenersOnPort(port)
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
