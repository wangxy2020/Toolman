import type { KnowledgeDocument } from '@toolman/shared'

export interface KnowledgeFilePanelItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  sizeBytes?: number | null
  mimeType?: string | null
  status?: KnowledgeDocument['status'] | 'pending'
  ingestProgress?: number | null
  chunkCount?: number
  errorMessage?: string | null
  absolutePath?: string | null
  sourceKind?: KnowledgeDocument['sourceKind']
}

export interface KnowledgeBaseFilePanelProps {
  documents: KnowledgeFilePanelItem[]
  loading?: boolean
  ingesting?: boolean
  importDisabled?: boolean
  hideDropzone?: boolean
  showIndexActions?: boolean
  defaultImportPath?: string | null
  mode?: 'file' | 'url'
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onImportFiles: (paths: string[]) => void | Promise<void>
  onImportError?: (message: string) => void
  onOpenAddUrl?: () => void
  onAddUrl?: (url: string) => void | Promise<void>
  onReindexDocument?: (id: string) => void
  onCancelIngestDocument?: (id: string) => void
  onDeleteDocument?: (id: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenMarkdownFile?: (doc: KnowledgeFilePanelItem) => boolean | void
  onContextMenu?: (event: React.MouseEvent, documentId?: string) => void
}
