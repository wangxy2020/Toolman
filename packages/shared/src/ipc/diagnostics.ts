import { z } from 'zod'
import { AppDiagnosticsProvenanceSchema } from './provenance.js'

export const DiagnosticLogLevelSchema = z.enum(['info', 'warn', 'error'])
export type DiagnosticLogLevel = z.infer<typeof DiagnosticLogLevelSchema>

export const DiagnosticLogEntrySchema = z.object({
  at: z.number().int().positive(),
  subsystem: z.string(),
  level: DiagnosticLogLevelSchema,
  message: z.string(),
})
export type DiagnosticLogEntry = z.infer<typeof DiagnosticLogEntrySchema>

export const AppDiagnosticsDatabaseSchema = z.object({
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  streamingMessageCount: z.number().int().nonnegative(),
})

export const AppDiagnosticsIngestSchema = z.object({
  pendingJobs: z.number().int().nonnegative(),
  failedJobs: z.number().int().nonnegative(),
})

export const AppDiagnosticsCommunityHubSchema = z.object({
  running: z.boolean(),
  baseUrl: z.string().nullable(),
  healthStatus: z.string().nullable(),
  version: z.string().nullable(),
  dbOk: z.boolean().nullable(),
  userCount: z.number().int().nonnegative().nullable(),
  resourceCount: z.number().int().nonnegative().nullable(),
  error: z.string().optional(),
})

export const AppDiagnosticsP2pConnectionSchema = z.object({
  peerDeviceId: z.string(),
  state: z.string(),
  transport: z.string().optional(),
})

export const AppDiagnosticsLibp2pRestartSchema = z.object({
  enabled: z.boolean(),
  attempt: z.number().int().nonnegative(),
  tripped: z.boolean(),
  nextDelayMs: z.number().int().nonnegative().nullable(),
  lastReason: z.string().nullable(),
  lastRestartAt: z.number().int().nonnegative().nullable(),
})

export const AppDiagnosticsP2pSchema = z.object({
  nativeAvailable: z.boolean(),
  nativeVersion: z.string().nullable(),
  deviceId: z.string(),
  displayName: z.string().nullable(),
  discoveryRunning: z.boolean(),
  workspaceCount: z.number().int().nonnegative(),
  connectedPeers: z.number().int().nonnegative(),
  wanConnectedPeers: z.number().int().nonnegative(),
  lanConnectedPeers: z.number().int().nonnegative(),
  iceServersSummary: z.string(),
  wanReadiness: z.object({
    ready: z.boolean(),
    summary: z.string(),
    reason: z.string().optional(),
    reasonCode: z.enum(['turn_not_configured', 'turn_missing_credentials']).optional(),
  }),
  connections: z.array(AppDiagnosticsP2pConnectionSchema),
  libp2pAvailable: z.boolean(),
  libp2pVersion: z.string().nullable(),
  libp2pRunning: z.boolean(),
  libp2pPeerId: z.string().nullable(),
  libp2pPeerCount: z.number().int().nonnegative(),
  libp2pPeers: z.array(
    z.object({
      peerId: z.string(),
      transport: z.string(),
      connectedAt: z.number().int().nonnegative().optional(),
    }),
  ),
  libp2pRestart: AppDiagnosticsLibp2pRestartSchema,
  dhtMode: z.enum(['off', 'client', 'server']).nullable(),
  dhtReady: z.boolean().nullable(),
  error: z.string().optional(),
})

export const AppDiagnosticsUpdateSchema = z.object({
  channel: z.string(),
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  manifestPath: z.string(),
  notes: z.string().nullable().optional(),
})

export const AppDiagnosticsOperationsSchema = z.object({
  appVersion: z.string(),
  logFilePath: z.string(),
  crashReportDir: z.string(),
  crashReportCount: z.number().int().nonnegative(),
  crashReportUploadEnabled: z.boolean(),
  crashReportPendingUpload: z.number().int().nonnegative(),
  crashReportIngestUrl: z.string().nullable(),
  update: AppDiagnosticsUpdateSchema,
})

export const AppDiagnosticsCommunityYjsSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  localDid: z.string().nullable(),
  localPeerId: z.string().nullable(),
  requireSignedUpdates: z.boolean(),
  acceptedSignedUpdates: z.number().int().nonnegative(),
  rejectedUnsignedUpdates: z.number().int().nonnegative(),
  verifyFailures: z.number().int().nonnegative(),
  blockedDidCount: z.number().int().nonnegative(),
  lastError: z.string().nullable().optional(),
})

export const AppDiagnosticsCommunityCidSchema = z.object({
  enabled: z.boolean(),
  running: z.boolean(),
  indexedPackages: z.number().int().nonnegative(),
  indexedChunks: z.number().int().nonnegative(),
  providedRootCids: z.number().int().nonnegative(),
  dhtProvides: z.number().int().nonnegative(),
  dhtProviderLookups: z.number().int().nonnegative(),
  fetchedPackages: z.number().int().nonnegative(),
  verifyFailures: z.number().int().nonnegative(),
  lastError: z.string().nullable().optional(),
})

export const AppGetDiagnosticsOutputSchema = z.object({
  collectedAt: z.number().int().positive(),
  database: AppDiagnosticsDatabaseSchema,
  ingest: AppDiagnosticsIngestSchema,
  communityHub: AppDiagnosticsCommunityHubSchema,
  communityYjs: AppDiagnosticsCommunityYjsSchema,
  communityCid: AppDiagnosticsCommunityCidSchema,
  p2p: AppDiagnosticsP2pSchema,
  operations: AppDiagnosticsOperationsSchema,
  provenance: AppDiagnosticsProvenanceSchema,
  recentEvents: z.array(DiagnosticLogEntrySchema),
})
export type AppGetDiagnosticsOutput = z.infer<typeof AppGetDiagnosticsOutputSchema>
