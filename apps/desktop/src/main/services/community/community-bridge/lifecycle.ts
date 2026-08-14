import { app } from 'electron'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { toErrorMessage } from '@toolman/shared'
import {
  COMMUNITY_HUB_DEFAULT_PORT,
  COMMUNITY_HUB_HOST,
  buildCommunityHubBaseUrl,
  getCommunityDataDir,
  resolveCommunityHubBinaryPath,
} from '../community-paths'
import { DEFAULT_LOCAL_IDENTITY_ID } from '../../local-identity'
import { CommunityHttpClient } from '../community-http.client'
import { resolveCommunityHubAuth } from '../community-hub-auth.service'
import { getHubJwtSecret } from '../../auth/hub-jwt-secret.service'
import {
  ensureDefaultCommunityHubConfig,
  getCommunityHubMode,
  readCommunityHubConfig,
  resolveCommunityHubBaseUrl,
} from '../community-hub.config'
import { tryAttachRunningCommunityHub, connectRemoteCommunityHub, incompatibleLocalHubReason } from './connection'
import { waitForHealth } from './health'
import {
  allocateCommunityHubPort,
  readCommunityHubPortFile,
  removeCommunityHubPortFile,
  writeCommunityHubPortFile,
} from './port-file'
import {
  attachProcessLogging,
  ensureHubBinarySigned,
  stopCommunityHub,
  stopCommunityHubProcessByPid,
} from './process'
import {
  childProcess,
  currentStatus,
  httpClient,
  log,
  setChildProcess,
  setCurrentStatus,
  setHttpClient,
} from './state'
import { getCommunityHubStatus } from './status'
import { HUB_START_MAX_ATTEMPTS, type CommunityHubPortFile, type CommunityHubStatus } from './types'

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
    setCurrentStatus({
      running: false,
      mode: 'local',
      port: null,
      host: COMMUNITY_HUB_HOST,
      baseUrl: null,
      binaryPath: null,
      offlineReadOnly: false,
      error,
    })
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
      COMMUNITY_HUB_HOST: process.env.COMMUNITY_HUB_HOST?.trim() || '0.0.0.0',
      COMMUNITY_HUB_DEFAULT_IDENTITY_ID:
        process.env.COMMUNITY_HUB_DEFAULT_IDENTITY_ID?.trim() || DEFAULT_LOCAL_IDENTITY_ID,
      COMMUNITY_HUB_DEV_TEST_ROLES:
        process.env.COMMUNITY_HUB_DEV_TEST_ROLES ?? 'false',
      COMMUNITY_HUB_JWT_SECRET: jwtSecret,
      COMMUNITY_HUB_ALLOW_HEADER_AUTH:
        process.env.COMMUNITY_HUB_ALLOW_HEADER_AUTH ?? 'true',
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
    setChildProcess(processHandle)
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

    log(`sidecar ready at ${currentStatus.baseUrl}`)
    return getCommunityHubStatus()
  }

  setCurrentStatus({
    running: false,
    mode: 'local',
    port: null,
    host: COMMUNITY_HUB_HOST,
    baseUrl: null,
    binaryPath,
    offlineReadOnly: false,
    error: lastError,
  })
  return getCommunityHubStatus()
}

export async function shutdownCommunityHub(): Promise<void> {
  if (getCommunityHubMode() === 'remote') {
    setHttpClient(null)
    setCurrentStatus({
      ...currentStatus,
      running: false,
    })
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
      setCurrentStatus({
        running: false,
        mode: 'remote',
        port: null,
        host: '',
        baseUrl: null,
        binaryPath: null,
        offlineReadOnly: false,
        error: '远程 Hub 未配置 baseUrl',
      })
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
  if (!portFile?.pid || !portFile.port) return

  const client = new CommunityHttpClient({
    port: portFile.port,
    host: COMMUNITY_HUB_HOST,
    resolveAuth: resolveCommunityHubAuth,
  })
  try {
    const health = await client.health()
    if (health.status !== 'healthy') return
    const reason = await incompatibleLocalHubReason(health, { portFile, binaryPath })
    if (!reason) return
    log(`replacing community hub sidecar (${reason})`)
    await stopCommunityHubProcessByPid(portFile.pid)
    await removeCommunityHubPortFile()
  } catch {
    // Do not kill the pid: another desktop instance (P2P user A) may own a
    // healthy sidecar that is still starting, or this instance cannot reach it.
    log('community hub sidecar not responding; will attach or spawn')
  }
}
