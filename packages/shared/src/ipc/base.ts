import { z } from 'zod'
import { ToolmanBuildProvenanceSchema } from './provenance.js'

export const UuidSchema = z.string().uuid()
export const TimestampSchema = z.number().int().positive()

export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

export const IpcErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'PERMISSION_DENIED',
  'CONFLICT',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'PLUGIN_ERROR',
  'SYNC_ERROR',
  'P2P_NATIVE_UNAVAILABLE',
  'P2P_NOT_FOUND',
  'P2P_FORBIDDEN',
  'P2P_ALREADY_EXISTS',
  'P2P_MEMBER_LIMIT',
  'P2P_MEMBER_VIP_REQUIRED',
  'P2P_INVITE_EXPIRED',
  'P2P_INVITE_REVOKED',
  'P2P_CONNECTION_FAILED',
  'P2P_SYNC_CONFLICT',
  'P2P_FILE_NOT_FOUND',
  'P2P_TRUST_REQUIRED',
  'P2P_INVALID_PACKAGE',
  'AUTH_NOT_IMPLEMENTED',
  'AUTH_NOT_CONFIGURED',
  'AUTH_MERGE_REQUIRED',
  'AUTH_REAUTH_REQUIRED',
  'AUTH_REGISTRATION_REQUIRED',
  'AUTH_NOT_LOGGED_IN',
  'INTERNAL_ERROR',
  'ABORTED',
])

export const IpcErrorSchema = z.object({
  code: IpcErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  retryable: z.boolean().default(false),
})

export type IpcError = z.infer<typeof IpcErrorSchema>

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function ipcErr(error: IpcError): IpcResult<never> {
  return { ok: false, error }
}

export const AppGetInfoOutputSchema = z.object({
  version: z.string(),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.string(),
  isPackaged: z.boolean(),
  deviceId: UuidSchema,
  schemaVersion: z.string(),
  provenance: ToolmanBuildProvenanceSchema,
})

export const AppGetPathsOutputSchema = z.object({
  userData: z.string(),
  logs: z.string(),
  blobs: z.string(),
  temp: z.string(),
  home: z.string(),
  documents: z.string(),
  desktop: z.string(),
  downloads: z.string(),
  knowledgeBase: z.string(),
})

export const AppShellOpenPathInputSchema = z.object({
  path: z.string().min(1),
})

export const AppShellOpenPathOutputSchema = z.object({
  opened: z.boolean(),
  error: z.string().optional(),
})

export const AppShellRevealPathInputSchema = z.object({
  path: z.string().min(1),
})

export const AppShellRevealPathOutputSchema = z.object({
  revealed: z.boolean(),
})

export const AppGetStorageStatsOutputSchema = z.object({
  cacheBytes: z.number().int().nonnegative(),
  userData: z.string(),
  userWorkDirectory: z.string(),
  logs: z.string(),
  knowledgeBase: z.string(),
})

export const AppClearCacheOutputSchema = z.object({
  clearedBytes: z.number().int().nonnegative(),
})

export const AppBackupDataInputSchema = z.object({
  notesDataJson: z.string().optional(),
})

export const AppBackupDataOutputSchema = z.object({
  backupPath: z.string(),
  includesKnowledge: z.boolean().optional(),
  includesNotes: z.boolean().optional(),
  manifestVersion: z.number().int().optional(),
})

export const AppRestoreDataInputSchema = z.object({
  backupPath: z.string().min(1),
  restoreKnowledge: z.boolean().default(true),
})

export const AppRestoreDataOutputSchema = z.object({
  restored: z.boolean(),
  includesKnowledge: z.boolean().optional(),
  notesDataJson: z.string().optional(),
})

export const AppResetDataOutputSchema = z.object({
  reset: z.boolean(),
  cleared: z.array(z.string()).optional(),
  memoryEntriesDeleted: z.number().optional(),
})

export const WorkspaceSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  isDefault: z.boolean(),
  settings: z.record(z.unknown()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Workspace = z.infer<typeof WorkspaceSchema>
