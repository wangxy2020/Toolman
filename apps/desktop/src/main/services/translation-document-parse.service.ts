import { basename, extname } from 'node:path'
import { parseFile } from '@toolman/knowledge'
import {
  TranslationDocumentParsePagesInputSchema,
  TranslationDocumentParsePagesOutputSchema,
  ipcErr,
  ipcOk,
  toErrorMessage,
} from '@toolman/shared'
import { parsePdfDocument, clearOdlPreviewCache } from './document-parser.service'
import { assertPathWithinAllowedRoots } from './path-sandbox.service'

const nonPdfPlainTextCache = new Map<string, string>()

function detectKind(filePath: string): 'pdf' | 'word' | 'excel' | 'unknown' {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.doc' || ext === '.docx') return 'word'
  if (ext === '.xls' || ext === '.xlsx' || ext === '.csv') return 'excel'
  return 'unknown'
}

export async function parseTranslationDocumentPages(input: unknown) {
  try {
    const data = TranslationDocumentParsePagesInputSchema.parse(input)
    const filePath = assertPathWithinAllowedRoots(data.path)
    const kind = detectKind(filePath)
    const startPage = Math.min(data.startPage, data.endPage)
    const endPage = Math.max(data.startPage, data.endPage)

    if (kind === 'pdf') {
      if (data.odlPreviewReset) {
        clearOdlPreviewCache(filePath)
      }
      const result = await parsePdfDocument({
        filePath,
        profile: data.metadataOnly ? 'metadata' : 'translation',
        pageRange: data.metadataOnly ? undefined : { start: startPage, end: endPage },
        workspaceId: data.workspaceId,
        pdfParserBackend: data.odlPreviewOnly ? 'opendataloader' : data.pdfParserBackend,
        odlPreviewOnly: data.odlPreviewOnly,
        fullDocument: data.fullDocument,
        ocrBackfillOnly: data.ocrBackfillOnly,
        odlHybridBackfill: data.odlHybridBackfill,
        odlPreviewReset: data.odlPreviewReset,
        odlWarmOnly: data.odlWarmOnly,
        odlProgressiveBatch: data.odlProgressiveBatch,
        odlSkipLocalWarm: data.odlSkipLocalWarm,
        ...(data.timeoutMs ? { timeoutMs: data.timeoutMs } : {}),
      })

      const hybridMeta = result as {
        hybridUnavailable?: boolean
        hybridUnavailableUrl?: string
        odlScanDetected?: boolean
      }

      return ipcOk(
        TranslationDocumentParsePagesOutputSchema.parse({
          totalPages: result.totalPages,
          pages: result.pages.map((page) => {
            const markdown = page.markdown?.trim() ?? page.text?.trim() ?? ''
            const text = page.text?.trim() ?? markdown
            return {
              pageNumber: page.pageNumber,
              text,
              ...(markdown || text ? { markdown: markdown || text } : {}),
            }
          }),
          kind,
          pageWidth: result.pageWidth,
          pageHeight: result.pageHeight,
          ...(hybridMeta.hybridUnavailable
            ? {
                hybridUnavailable: true,
                hybridUnavailableUrl: hybridMeta.hybridUnavailableUrl,
              }
            : {}),
          ...(hybridMeta.odlScanDetected ? { odlScanDetected: true } : {}),
        }),
      )
    }

    // Non-PDF: treat the whole document as a single page.
    if (startPage > 1) {
      return ipcOk(
        TranslationDocumentParsePagesOutputSchema.parse({
          totalPages: 1,
          pages: [],
          kind,
        }),
      )
    }

    const parsed = nonPdfPlainTextCache.get(filePath)
      ? { plainText: nonPdfPlainTextCache.get(filePath)! }
      : await parseFile(filePath, {
          enhanced: true,
          pdfTextQuality: 'lenient',
        })
    if (!nonPdfPlainTextCache.has(filePath)) {
      nonPdfPlainTextCache.set(filePath, parsed.plainText)
    }
    return ipcOk(
      TranslationDocumentParsePagesOutputSchema.parse({
        totalPages: 1,
        pages: [{ pageNumber: 1, text: parsed.plainText.trim() }],
        kind,
      }),
    )
  } catch (error) {
    return ipcErr({
      code: 'INTERNAL_ERROR',
      message: toErrorMessage(
        error,
        `解析文档失败（${basename(String((input as { path?: string })?.path ?? ''))}）`,
      ),
      retryable: false,
    })
  }
}
