import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { COMMUNITY_HUB_HOST } from '../community-paths'
import { getCommunityHubMode, resolveCommunityHubBaseUrl } from '../community-hub.config'
import { hasAnyCommunityHubCache } from '../community-hub-cache.service'
import { removeCommunityHubPortFile } from './port-file'
import {
  childProcess,
  currentStatus,
  log,
  setChildProcess,
  setCurrentStatus,
  setHttpClient,
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

export function attachProcessLogging(process: ChildProcess): void {
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
