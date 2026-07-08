import {
  approxTokenCount,
  chunkText,
  type ChunkConfig,
  type TextChunk,
} from './text-chunker.js'
import {
  formatPdfPageMarker,
  hasPdfPageMarkers,
  splitPdfPagesByMarkers,
} from '../parsers/pdf-page-markers.js'

/**
 * Chunk PDF plain text by page boundaries when page markers are present.
 * Each chunk includes the page marker prefix and pageNumber metadata.
 */
export function chunkPdfText(text: string, config: ChunkConfig): TextChunk[] {
  if (!hasPdfPageMarkers(text)) {
    return chunkText(text, config)
  }

  const pages = splitPdfPagesByMarkers(text)
  if (pages.length === 0) {
    return chunkText(text, config)
  }

  const chunks: TextChunk[] = []
  let index = 0

  for (const page of pages) {
    const marker = formatPdfPageMarker(page.pageNumber)
    const pageChunks = chunkText(page.text, config)
    for (const chunk of pageChunks) {
      const chunkTextValue = `${marker}\n${chunk.text}`.trim()
      chunks.push({
        index: index++,
        text: chunkTextValue,
        tokenCount: approxTokenCount(chunkTextValue),
        metadata: {
          ...(chunk.metadata ?? {}),
          pageNumber: page.pageNumber,
        },
      })
    }
  }

  return chunks
}
