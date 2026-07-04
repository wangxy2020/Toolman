import { basename, extname } from 'node:path'
import { extractPdfPageTexts, parseFile } from '@toolman/knowledge'
import {
  TranslationDocumentParsePagesInputSchema,
  TranslationDocumentParsePagesOutputSchema,
  ipcErr,
  ipcOk,
  toErrorMessage,
} from '@toolman/shared'
import { assertPathWithinAllowedRoots } from './path-sandbox.service'

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
      const result = await extractPdfPageTexts(filePath, startPage, endPage)
      return ipcOk(
        TranslationDocumentParsePagesOutputSchema.parse({
          totalPages: result.totalPages,
          pages: result.pages,
          kind,
          pageWidth: result.pageWidth,
          pageHeight: result.pageHeight,
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

    const parsed = await parseFile(filePath, {
      enhanced: true,
      pdfTextQuality: 'lenient',
    })
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
