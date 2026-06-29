import type { KnowledgeBase } from '@toolman/shared'

export interface KnowledgeBaseSettingsModalProps {
  workspaceId: string
  kb: KnowledgeBase
  nameReadOnly?: boolean
  defaultFolderKind?: 'local' | 'network' | 'local_files'
  onClose: () => void
  onSaved?: () => void | Promise<void>
}

export type SettingsTab = 'basic' | 'watch' | 'memory' | 'advanced'

export const DEFAULT_SCORE_THRESHOLD = 0.3
