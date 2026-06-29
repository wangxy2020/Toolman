import { toErrorMessage } from '@toolman/shared'
import { recordDiagnosticEvent } from '../../diagnostics-log'
import {
  COMMUNITY_HUB_DEFAULT_PORT,
  COMMUNITY_HUB_HOST,
  buildCommunityHubBaseUrl,
  resolveCommunityHubBinaryPath,
} from '../community-paths'
import { CommunityHttpClient } from '../community-http.client'
import { resolveCommunityHubAuth } from '../community-hub-auth.service'
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
import type { CommunityHubStatus } from './types'

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

  if (childProcess && currentStatus.port !== null) {
    const client = new CommunityHttpClient({
      port: currentStatus.port,
      host: COMMUNITY_HUB_HOST,
      resolveAuth: resolveCommunityHubAuth,
    })
    try {
      const health = await client.health()
      if (health.status === 'healthy') {
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
  return attached !== null && httpClient !== null
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

      const rateLimitRpm = health.rate_limit_rpm ?? 0
      if (rateLimitRpm > 0) {
        log(
          `skipping attach to hub on port ${port} (rate_limit_rpm=${rateLimitRpm}); will spawn an unlimited hub instead`,
        )
        if (portFile?.port === port && portFile.pid) {
          await stopCommunityHubProcessByPid(portFile.pid)
          await removeCommunityHubPortFile()
        }
        continue
      }

      setHttpClient(client)
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
