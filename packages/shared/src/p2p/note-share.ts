export interface P2pNoteShareMetadata {
  notebookId: string
  notebookName: string
  title: string
  editorMode?: 'markdown' | 'blocks'
}

export function buildP2pNoteShareMetadata(meta: P2pNoteShareMetadata): string {
  return JSON.stringify({
    notebookId: meta.notebookId,
    notebookName: meta.notebookName,
    title: meta.title,
    editorMode: meta.editorMode,
  })
}

export function parseP2pNoteShareMetadata(
  metadataJson: string | null | undefined,
): P2pNoteShareMetadata | null {
  if (!metadataJson) return null
  try {
    const parsed = JSON.parse(metadataJson) as Partial<P2pNoteShareMetadata>
    const notebookId = parsed.notebookId?.trim()
    const title = parsed.title?.trim()
    if (!notebookId || !title) return null
    const notebookName = parsed.notebookName?.trim() || '笔记本'
    return {
      notebookId,
      notebookName,
      title,
      editorMode:
        parsed.editorMode === 'blocks' || parsed.editorMode === 'markdown'
          ? parsed.editorMode
          : undefined,
    }
  } catch {
    return null
  }
}
