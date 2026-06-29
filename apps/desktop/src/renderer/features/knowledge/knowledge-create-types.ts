import type { KnowledgeBaseKind } from '@toolman/shared'
import type { KnowledgeFileTypeCount } from './knowledge-file-types'

export type KnowledgeSourcePick =
  | { mode: 'none' }
  | { mode: 'url'; url: string }
  | { mode: 'folder-empty'; folderPath: string }
  | {
      mode: 'folder-with-files'
      folderPath: string
      totalFiles: number
      fileCounts: KnowledgeFileTypeCount[]
    }
  | {
      mode: 'files'
      parentPath: string
      filePaths: string[]
      totalFiles: number
      fileCounts: KnowledgeFileTypeCount[]
    }

export interface KnowledgeCreateInput {
  name: string
  description?: string
  kind: KnowledgeBaseKind
  kbPath: string
  sourcePick: KnowledgeSourcePick
}

export interface KnowledgeCreateModalProps {
  defaultLocalFolderPath: string | null
  defaultNetworkFolderPath: string | null
  defaultLocalFilesFolderPath: string | null
  onClose: () => void
  onSubmit: (input: KnowledgeCreateInput) => Promise<void>
}
