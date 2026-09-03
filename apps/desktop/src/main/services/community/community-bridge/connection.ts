import { toErrorMessage } from '@toolman/shared'
import { recordDiagnosticEvent } from '../../diagnostics-log'
import { stat } from 'node:fs/promises'
import {
  COMMUNITY_HUB_DEFAULT_PORT,
  COMMUNITY_HUB_HOST,
  buildCommunityHubBaseUrl,
  resolveCommunityHubBinaryPath,
} from '../community-paths'
import { CommunityHttpClient } from '../community-http.client'
import type { CommunityHealthData } from '../community-http/community-http.types'
import { resolveCommunityHubAuth } from '../community-hub-auth.service'
import { getCommunityHubMode, resolveCommunityHubBaseUrl } from '../community-hub.config'
import { hasAnyCommunityHubCache } from '../community-hub-cache.service'
import { waitForHealth } from './health'
import {
  readCommunityHubPortFile,
  removeCommunityHubPortFile,
} from './port-file'
import { stopCommunityHubProcessByPid } from './process'
import {
  childProcess,
  currentStatus,
  httpClient,
  log,
  setCurrentStatus,
  setHttpClient,
} from './state'
import { getCommunityHubStatus } from './status'
import type { CommunityHubPortFile, CommunityHubStatus } from './types'

const HEALTH_OK_TTL_MS = 3_000
let lastHealthyAt = 0

export async function incompatibleLocalHubReason(
  health: CommunityHealthData,
  options?: { portFile?: CommunityHubPortFile | null; binaryPath?: string | null },
): Promise<string | null> {
  if ((health.rate_limit_rpm ?? 0) > 0) {
    return `rate_limit_rpm=${health.rate_limit_rpm}`
  }
  const startedAt = options?.portFile?.startedAt
  const binaryPath = options?.binaryPath
  if (typeof startedAt === 'number' && binaryPath) {
    try {
      const binaryStat = await stat(binaryPath)
      if (binaryStat.mtimeMs > startedAt) {
        return 'newer community hub binary'
      }
    } catch {
      // ignore missing binary
    }
  }
  return null
}

export async function connectRemoteCommunityHub(baseUrl: string): Promise<CommunityHubStatus> {
  const client = new CommunityHttpClient({
    baseUrl,
    resolveAuth: resolveCommunityHubAuth,
  })

  try {
    await waitForHealth(client)
    setHttpClient(client)
    setCurrentStatus({
      running: true,
      mode: 'remote',
      port: null,
      host: '',
      baseUrl,
      binaryPath: null,
      offlineReadOnly: false,
    })
    log(`connected to remote hub at ${baseUrl}`)
    return getCommunityHubStatus()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    const offlineReadOnly = hasAnyCommunityHubCache()
    setHttpClient(null)
    setCurrentStatus({
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
    })
    recordDiagnosticEvent('community-hub', 'warn', currentStatus.error ?? message)
    return getCommunityHubStatus()
  }
}

export async function recoverCommunityHubConnection(): Promise<CommunityHubStatus> {
  if (await refreshCommunityHubClientIfNeeded()) {
    return getCommunityHubStatus()
  }

  if (getCommunityHubMode() === 'remote') {
    const baseUrl = resolveCommunityHubBaseUrl()
    if (baseUrl) {
      return connectRemoteCommunityHub(baseUrl)
    }
    return getCommunityHubStatus()
  }

  log('local sidecar not running; restarting')
  const { startCommunityHub } = await import('./lifecycle')
  return startCommunityHub()
}

function markLocalHubNotRunning(): void {
  lastHealthyAt = 0
  if (!currentStatus.running && httpClient == null) return
  setCurrentStatus({
    ...currentStatus,
    running: false,
    error: currentStatus.error ?? 'Community hub is not running',
  })
}

/** Re-attach when the cached client points at a dead port (common in dual-instance dev). */
export async function refreshCommunityHubClientIfNeeded(): Promise<boolean> {
  if (
    httpClient &&
    currentStatus.running &&
    !currentStatus.offlineReadOnly &&
    Date.now() - lastHealthyAt < HEALTH_OK_TTL_MS
  ) {
    return true
  }

  if (httpClient) {
    try {
      const health = await httpClient.health()
      if (health.status === 'healthy') {
        lastHealthyAt = Date.now()
        if (!currentStatus.running || currentStatus.offlineReadOnly) {
          setCurrentStatus({
            ...currentStatus,
            running: true,
            offlineReadOnly: false,
            error: undefined,
          })
        }
        return true
      }
    } catch {
      // stale client — re-attach below
    }
  }

  setHttpClient(null)
  lastHealthyAt = 0

  if (getCommunityHubMode() === 'remote') {
    markLocalHubNotRunning()
    return false
  }

  if (childProcess && currentStatus.port !== null) {
    const client = new CommunityHttpClient({
      port: currentStatus.port,
      host: COMMUNITY_HUB_HOST,
      resolveAuth: resolveCommunityHubAuth,
    })
    try {
      const health = await client.health()
      if (health.status === 'healthy') {
        lastHealthyAt = Date.now()
        setHttpClient(client)
        setCurrentStatus({
          ...currentStatus,
          running: true,
          offlineReadOnly: false,
          error: undefined,
        })
        return true
      }
    } catch {
      // owned sidecar may have exited
    }
  }

  const attached = await tryAttachRunningCommunityHub()
  if (attached !== null && httpClient !== null) {
    return true
  }

  markLocalHubNotRunning()
  return false
}

export async function tryAttachRunningCommunityHub(): Promise<CommunityHubStatus | null> {
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

      const reason = await incompatibleLocalHubReason(health, {
        portFile: portFile?.port === port ? portFile : null,
        binaryPath,
      })
      if (reason) {
        log(
          `skipping attach to hub on port ${port} (${reason}); will spawn an updated sidecar instead`,
        )
        if (portFile?.port === port && portFile.pid) {
          await stopCommunityHubProcessByPid(portFile.pid)
          await removeCommunityHubPortFile()
        }
        continue
      }

      setHttpClient(client)
      lastHealthyAt = Date.now()
      setCurrentStatus({
        running: true,
        mode: 'local',
        port,
        host: COMMUNITY_HUB_HOST,
        baseUrl: buildCommunityHubBaseUrl(port),
        binaryPath,
        offlineReadOnly: false,
      })
      log(`attached to existing sidecar at ${currentStatus.baseUrl}`)
      return getCommunityHubStatus()
    } catch {
      // try next candidate port
    }
  }

  return null
}
