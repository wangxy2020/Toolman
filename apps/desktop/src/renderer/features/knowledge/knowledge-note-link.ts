const NOTE_ID_PREFIX =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i

export function resolveNoteIdFromFileName(fileName: string): string | null {
  const match = fileName.match(NOTE_ID_PREFIX)
  return match?.[1] ?? null
}

export function resolveNoteIdFromKnowledgePath(absolutePath: string | null | undefined): string | null {
  if (!absolutePath) return null
  if (!absolutePath.includes('notes-import')) return null

  const fileName = absolutePath.split(/[/\\]/).pop() ?? ''
  return resolveNoteIdFromFileName(fileName)
}

export function resolveNoteIdFromKnowledgeDocument(input: {
  title: string
  absolutePath?: string | null
}): string | null {
  return (
    resolveNoteIdFromKnowledgePath(input.absolutePath) ?? resolveNoteIdFromFileName(input.title)
  )
}
