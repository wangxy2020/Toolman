import type { KnowledgeBase } from '@toolman/shared'
import type { ReactNode } from 'react'
import type { SystemPaths } from '../chat/useSystemPaths'
import type { KnowledgeFilePanelItem } from './KnowledgeBaseFilePanel'
import type { KnowledgeSidebarSection } from './knowledge-sidebar-types'

export type SettingsTarget = 'kb' | null

export interface PendingFileDelete {
  ids: string[]
  message: string
}

export interface KnowledgePageProps {
  workspaceId: string | null
  section: KnowledgeSidebarSection
  activeId: string | null
  active: KnowledgeBase | null
  knowledgeFolderPath: string | null
  knowledgeFolderLoading?: boolean
  knowledgeFolderError?: string | null
  networkKnowledgeFolderPath: string | null
  networkKnowledgeFolderLoading?: boolean
  networkKnowledgeFolderError?: string | null
  localFilesFolderPath: string | null
  localFilesFolderLoading?: boolean
  localFilesFolderError?: string | null
  loading?: boolean
  error?: string | null
  onKbChanged?: () => void
  onKnowledgeFolderPathChanged?: (path: string) => void
  onKnowledgeFolderError?: (message: string | null) => void
  onNetworkKnowledgeFolderPathChanged?: (path: string) => void
  onNetworkKnowledgeFolderError?: (message: string | null) => void
  onLocalFilesFolderPathChanged?: (path: string) => void
  onLocalFilesFolderError?: (message: string | null) => void
  systemPaths?: SystemPaths | null
  onOpenNote?: (noteId: string) => boolean
  onChatWithKnowledgeFiles?: (items: KnowledgeFilePanelItem[]) => void
}

export interface KnowledgePageStatusRegistryProps {
  error?: string | null
  documentsError: string | null
  onClearDocumentsError: () => void
  knowledgeFolderError?: string | null
  networkKnowledgeFolderError?: string | null
  localFilesFolderError?: string | null
  localDefaultKbError: string | null
  onClearLocalDefaultKbError: () => void
  networkDefaultKbError: string | null
  onClearNetworkDefaultKbError: () => void
  localFilesDefaultKbError: string | null
  onClearLocalFilesDefaultKbError: () => void
}

export interface KnowledgePageHeaderProps {
  sectionLabel: string
  kbName?: string
  settingsEnabled: boolean
  onOpenSettings: () => void
  dedupMode?: boolean
  dedupFolderPath?: string | null
  dedupScanning?: boolean
  onSelectDedupFolder?: () => void
  onDedupRefresh?: () => void
  onDedupGoParent?: () => void
  toolbar?: ReactNode
}
