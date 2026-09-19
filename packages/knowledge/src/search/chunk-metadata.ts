export interface ParsedChunkMetadata {
  pageNumber?: number
  heading?: string
  section?: string
  paragraph?: string
  chunkIndex?: number
  sourceType?: string
  sourceUrl?: string
  fileName?: string
  documentId?: string
  knowledgeBaseId?: string
  sourceKey?: string
  kind?: string
}

export function parseChunkMetadata(metadataJson: string | null | undefined): ParsedChunkMetadata {
  if (!metadataJson) return {}
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>
    const pageNumber =
      typeof parsed.pageNumber === 'number' && Number.isFinite(parsed.pageNumber)
        ? parsed.pageNumber
        : undefined
    return {
      ...(pageNumber != null ? { pageNumber } : {}),
      ...(typeof parsed.heading === 'string' ? { heading: parsed.heading } : {}),
      ...(typeof parsed.section === 'string' ? { section: parsed.section } : {}),
      ...(typeof parsed.paragraph === 'string' ? { paragraph: parsed.paragraph } : {}),
      ...(typeof parsed.chunkIndex === 'number' ? { chunkIndex: parsed.chunkIndex } : {}),
      ...(typeof parsed.sourceType === 'string' ? { sourceType: parsed.sourceType } : {}),
      ...(typeof parsed.sourceUrl === 'string' ? { sourceUrl: parsed.sourceUrl } : {}),
      ...(typeof parsed.fileName === 'string' ? { fileName: parsed.fileName } : {}),
      ...(typeof parsed.documentId === 'string' ? { documentId: parsed.documentId } : {}),
      ...(typeof parsed.knowledgeBaseId === 'string'
        ? { knowledgeBaseId: parsed.knowledgeBaseId }
        : {}),
      ...(typeof parsed.sourceKey === 'string' ? { sourceKey: parsed.sourceKey } : {}),
      ...(typeof parsed.kind === 'string' ? { kind: parsed.kind } : {}),
    }
  } catch {
    return {}
  }
}
