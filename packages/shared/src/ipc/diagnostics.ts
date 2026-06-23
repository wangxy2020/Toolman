import { z } from 'zod'

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

export const AppDiagnosticsP2pSchema = z.object({
  nativeAvailable: z.boolean(),
  nativeVersion: z.string().nullable(),
  deviceId: z.string(),
  displayName: z.string().nullable(),
  discoveryRunning: z.boolean(),
  workspaceCount: z.number().int().nonnegative(),
  connectedPeers: z.number().int().nonnegative(),
  connections: z.array(AppDiagnosticsP2pConnectionSchema),
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
  update: AppDiagnosticsUpdateSchema,
})

export const AppGetDiagnosticsOutputSchema = z.object({
  collectedAt: z.number().int().positive(),
  database: AppDiagnosticsDatabaseSchema,
  ingest: AppDiagnosticsIngestSchema,
  communityHub: AppDiagnosticsCommunityHubSchema,
  p2p: AppDiagnosticsP2pSchema,
  operations: AppDiagnosticsOperationsSchema,
  recentEvents: z.array(DiagnosticLogEntrySchema),
})
export type AppGetDiagnosticsOutput = z.infer<typeof AppGetDiagnosticsOutputSchema>
