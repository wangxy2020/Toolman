import { basename } from 'node:path'
import { renderPdfPagePreview } from '@toolman/knowledge'
import {
  TranslationDocumentRenderPageInputSchema,
  TranslationDocumentRenderPageOutputSchema,
  ipcErr,
  ipcOk,
  toErrorMessage,
} from '@toolman/shared'
import { assertPathWithinAllowedRoots } from './path-sandbox.service'

export async function renderTranslationDocumentPage(input: unknown) {
  try {
    const data = TranslationDocumentRenderPageInputSchema.parse(input)
    const filePath = assertPathWithinAllowedRoots(data.path)
    const rendered = await renderPdfPagePreview(filePath, data.pageNumber, data.targetWidth)
    return ipcOk(
      TranslationDocumentRenderPageOutputSchema.parse({
        totalPages: rendered.totalPages,
        pageNumber: rendered.pageNumber,
        base64: rendered.png.toString('base64'),
        mimeType: rendered.mimeType,
        width: rendered.width,
        height: rendered.height,
      }),
    )
  } catch (error) {
    return ipcErr({
      code: 'INTERNAL_ERROR',
      message: toErrorMessage(
        error,
        `渲染文档页面失败（${basename(String((input as { path?: string })?.path ?? ''))}）`,
      ),
      retryable: false,
    })
  }
}
