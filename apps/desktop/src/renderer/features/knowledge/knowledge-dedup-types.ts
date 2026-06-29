export interface DuplicateFile {
  path: string
  sizeBytes: number
  mtimeMs?: number
}

export interface DuplicateGroup {
  contentHash: string
  sizeBytes: number
  files: DuplicateFile[]
}

export interface ScanStats {
  scannedCount: number
  totalSizeBytes: number
  savableBytes: number
}

export interface DedupFileRow {
  path: string
  sizeBytes: number
  contentHash: string
  fileName: string
  extension: string
  mtimeMs: number
  isFirstInGroup: boolean
}

export interface DedupScanProgress {
  phase: 'listing' | 'hashing'
  scanned: number
  total: number
  etaSeconds: number | null
}

export interface DedupScanState {
  scanning: boolean
  progress: DedupScanProgress | null
}

export type SelectMode = 'all' | 'largest' | 'oldest' | 'smart'

export type PendingDedupDelete =
  | { kind: 'selected'; paths: string[]; message: string }
  | { kind: 'single'; path: string; message: string }

export interface KnowledgeFileDedupPanelProps {
  workspaceId: string
  folderPath: string | null
  onFolderPathChange: (path: string) => void
  onScanStateChange?: (state: DedupScanState) => void
  refreshToken?: number
}
