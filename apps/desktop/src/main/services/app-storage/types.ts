export const BACKUP_MANIFEST_VERSION = 1

export interface BackupManifest {
  version: number
  createdAt: number
  includesKnowledge: boolean
  includesNotes: boolean
  includesP2pWorkspaces?: boolean
  includesNotesAttachments?: boolean
  dbPath: string
  knowledgePath: string | null
  notesPath: string | null
  p2pWorkspacesPath?: string | null
  notesAttachmentsPath?: string | null
}

export function validateBackupManifest(manifest: unknown): manifest is BackupManifest {
  if (!manifest || typeof manifest !== 'object') return false
  const record = manifest as Record<string, unknown>
  return (
    record.version === BACKUP_MANIFEST_VERSION &&
    typeof record.createdAt === 'number' &&
    typeof record.includesKnowledge === 'boolean' &&
    typeof record.includesNotes === 'boolean' &&
    typeof record.dbPath === 'string' &&
    record.dbPath.length > 0 &&
    (record.knowledgePath === null || typeof record.knowledgePath === 'string') &&
    (record.notesPath === null || typeof record.notesPath === 'string') &&
    (record.includesP2pWorkspaces === undefined || typeof record.includesP2pWorkspaces === 'boolean') &&
    (record.includesNotesAttachments === undefined || typeof record.includesNotesAttachments === 'boolean') &&
    (record.p2pWorkspacesPath === undefined ||
      record.p2pWorkspacesPath === null ||
      typeof record.p2pWorkspacesPath === 'string') &&
    (record.notesAttachmentsPath === undefined ||
      record.notesAttachmentsPath === null ||
      typeof record.notesAttachmentsPath === 'string')
  )
}
