import { fireAndForget } from '../../../lib/fire-and-forget'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { copyFile, chmod, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import {
  COMMUNITY_HUB_HOST,
  getCommunityHubRuntimeBinaryPath,
} from '../community-paths'
import { getCommunityHubMode, resolveCommunityHubBaseUrl } from '../community-hub.config'
import { hasAnyCommunityHubCache } from '../community-hub-cache.service'
import { removeCommunityHubPortFile } from './port-file'
import {
  childProcess,
  currentStatus,
  getHubUnexpectedExitHandler,
  hubShutdownRequested,
  hubStopIntentional,
  log,
  setChildProcess,
  setCurrentStatus,
  setHttpClient,
  setHubStopIntentional,
} from './state'

export function ensureHubBinarySigned(binaryPath: string): void {
  if (process.platform !== 'darwin') return
  const result = spawnSync('codesign', ['--force', '--sign', '-', binaryPath], {
    stdio: 'ignore',
  })
  if (result.status !== 0) {
    log('failed to ad-hoc sign community hub binary; macOS may block launch')
  }
}

/** Copy the hub binary into the data dir so cargo/rebuild of the source file cannot kill a running sidecar. */
export async function materializeHubBinary(sourcePath: string, dataDir: string): Promise<string> {
  const destPath = getCommunityHubRuntimeBinaryPath(dataDir)
  await mkdir(dirname(destPath), { recursive: true })

  let shouldCopy = true
  try {
    const [sourceStat, destStat] = await Promise.all([stat(sourcePath), stat(destPath)])
    shouldCopy = sourceStat.mtimeMs > destStat.mtimeMs || sourceStat.size !== destStat.size
  } catch {
    shouldCopy = true
  }

  if (shouldCopy) {
    try {
      await copyFile(sourcePath, destPath)
      if (process.platform !== 'win32') {
        await chmod(destPath, 0o755)
      }
      ensureHubBinarySigned(destPath)
    } catch (error) {
      if (!existsSync(destPath)) {
        throw error instanceof Error ? error : new Error(toErrorMessage(error, String(error)))
      }
      log(
        `reusing existing runtime hub binary at ${destPath} (${toErrorMessage(error, String(error))})`,
      )
    }
  }

  return destPath
}

export function attachProcessLogging(processHandle: ChildProcess): void {
  processHandle.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) log(text)
  })
  processHandle.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8').trim()
    if (text) log(text, undefined)
  })
  processHandle.on('exit', (code, signal) => {
    if (!currentStatus.running) return
    const shouldRestart = !hubShutdownRequested && !hubStopIntentional
    log(
      `sidecar exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})${shouldRestart ? '; restarting' : ''}`,
    )
    fireAndForget(
      'community.hub',
      (async () => {
        await markStopped()
        if (!shouldRestart) return
        const handler = getHubUnexpectedExitHandler()
        if (handler) await handler()
      })(),
    )
  })
}

export async function markStopped(): Promise<void> {
  setChildProcess(null)
  setHttpClient(null)
  const mode = getCommunityHubMode()
  setCurrentStatus({
    running: false,
    mode,
    port: null,
    host: mode === 'remote' ? '' : COMMUNITY_HUB_HOST,
    baseUrl: mode === 'remote' ? resolveCommunityHubBaseUrl() : null,
    binaryPath: currentStatus.binaryPath,
    offlineReadOnly: mode === 'remote' && hasAnyCommunityHubCache(),
    error: mode === 'remote' ? currentStatus.error : undefined,
  })
  if (mode === 'local') {
    await removeCommunityHubPortFile()
  }
}

export async function stopCommunityHubProcessByPid(pid: number): Promise<void> {
  if (pid <= 0) return
  if (childProcess?.pid === pid) {
    await stopCommunityHub()
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 2_000)
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }).on('close', () => {
        clearTimeout(timeout)
        resolve()
      })
      return
    }

    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      clearTimeout(timeout)
      resolve()
      return
    }

    setTimeout(() => {
      try {
        process.kill(pid, 0)
        process.kill(pid, 'SIGKILL')
      } catch {
        // process already exited
      }
      clearTimeout(timeout)
      resolve()
    }, 500)
  })
}

export async function stopCommunityHub(target = childProcess): Promise<void> {
  setHubStopIntentional(true)
  try {
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
  } finally {
    setHubStopIntentional(false)
  }
}
