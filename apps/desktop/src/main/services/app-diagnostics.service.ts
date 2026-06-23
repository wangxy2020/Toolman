import { app } from 'electron'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { ingestJobs, messages } from '@toolman/db'
import {
  AppGetDiagnosticsOutputSchema,
  type AppGetDiagnosticsOutput,
} from '@toolman/shared'
import { getDatabase } from '../bootstrap/database'
import { getCommunityHubStatus } from './community/community-bridge.service'
import { getHubHealth } from './community/community-ipc.facade'
import { listDiagnosticEvents, recordDiagnosticEvent } from './diagnostics-log'
import { P2pBridge } from './p2p/p2p-bridge'
import { listP2pConnections } from './p2p/p2p-connection.service'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { isP2pDiscoveryRunning } from './p2p/p2p-discovery.service'
import { getIdentityProfile } from './identity.service'
import { listP2pWorkspaces } from './p2p/p2p-workspace.service'

const INGEST_PENDING_STAGES = [
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
] as const

function getDatabaseDiagnostics(): AppGetDiagnosticsOutput['database'] {
  const dbPath = join(app.getPath('userData'), 'toolman.db')
  let sizeBytes = 0
  try {
    sizeBytes = statSync(dbPath).size
  } catch {
    recordDiagnosticEvent('database', 'warn', `无法读取数据库文件大小: ${dbPath}`)
  }

  const db = getDatabase()
  const streamingRow = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.status, 'streaming'), isNull(messages.deletedAt)))
    .get()

  return {
    path: dbPath,
    sizeBytes,
    streamingMessageCount: Number(streamingRow?.count ?? 0),
  }
}

function getIngestDiagnostics(): AppGetDiagnosticsOutput['ingest'] {
  const db = getDatabase()
  const pendingRow = db
    .select({ count: sql<number>`count(*)` })
    .from(ingestJobs)
    .where(inArray(ingestJobs.stage, [...INGEST_PENDING_STAGES]))
    .get()
  const failedRow = db
    .select({ count: sql<number>`count(*)` })
    .from(ingestJobs)
    .where(eq(ingestJobs.stage, 'failed'))
    .get()

  return {
    pendingJobs: Number(pendingRow?.count ?? 0),
    failedJobs: Number(failedRow?.count ?? 0),
  }
}

async function getCommunityHubDiagnostics(): Promise<AppGetDiagnosticsOutput['communityHub']> {
  const status = getCommunityHubStatus()
  const base: AppGetDiagnosticsOutput['communityHub'] = {
    running: status.running,
    baseUrl: status.baseUrl,
    healthStatus: null,
    version: null,
    dbOk: null,
    userCount: null,
    resourceCount: null,
    error: status.error,
  }

  if (!status.running) {
    return base
  }

  try {
    const health = await getHubHealth()
    return {
      ...base,
      healthStatus: health.status,
      version: health.version ?? null,
      dbOk: health.db === 'ok',
      userCount: health.userCount ?? null,
      resourceCount: health.resourceCount ?? null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Community Hub health check failed'
    recordDiagnosticEvent('community-hub', 'error', message)
    return {
      ...base,
      error: message,
    }
  }
}

async function getP2pDiagnostics(): Promise<AppGetDiagnosticsOutput['p2p']> {
  const device = getP2pDeviceInfo()
  const identity = getIdentityProfile()
  let nativeAvailable = false
  let nativeVersion: string | null = null
  let nativeError: string | undefined

  try {
    P2pBridge.ping()
    nativeAvailable = true
    nativeVersion = P2pBridge.version()
  } catch (error) {
    nativeError = error instanceof Error ? error.message : 'P2P native module unavailable'
    recordDiagnosticEvent('p2p', 'error', nativeError)
  }

  let connections: AppGetDiagnosticsOutput['p2p']['connections'] = []
  try {
    const rows = await listP2pConnections()
    connections = rows.map((row) => ({
      peerDeviceId: row.peerDeviceId,
      state: row.state,
      transport: row.connectionMode,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list P2P connections'
    recordDiagnosticEvent('p2p', 'warn', message)
    nativeError = nativeError ?? message
  }

  return {
    nativeAvailable,
    nativeVersion,
    deviceId: device.deviceId,
    displayName: identity.displayName ?? null,
    discoveryRunning: isP2pDiscoveryRunning(),
    workspaceCount: listP2pWorkspaces('all').length,
    connectedPeers: connections.filter((row) => row.state === 'connected').length,
    connections,
    error: nativeError,
  }
}

export async function getAppDiagnostics(): Promise<AppGetDiagnosticsOutput> {
  const [communityHub, p2p] = await Promise.all([
    getCommunityHubDiagnostics(),
    getP2pDiagnostics(),
  ])

  const snapshot = {
    collectedAt: Date.now(),
    database: getDatabaseDiagnostics(),
    ingest: getIngestDiagnostics(),
    communityHub,
    p2p,
    recentEvents: listDiagnosticEvents(30),
  }

  return AppGetDiagnosticsOutputSchema.parse(snapshot)
}
