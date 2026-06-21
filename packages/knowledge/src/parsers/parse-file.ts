import { readFileSync } from 'node:fs'
import mammoth from 'mammoth'
import { extractPdfPlainText, type OcrPageRecognizer } from './parse-pdf.js'
import WordExtractor from 'word-extractor'
import { defaultTitle, detectFileKind, isImageFilePath, mimeTypeForKind } from './file-type.js'
import { htmlToPlainText } from './parse-html.js'
import { extractPptxPlainText } from './parse-pptx.js'
import { extractEpubPlainText } from './parse-epub.js'
import { extractSpreadsheetPlainText } from './parse-spreadsheet.js'
import type { ParsedDocument, SupportedFileKind } from './types.js'

export interface ParseFileOcrOptions {
  enabled: boolean
  recognizePage: OcrPageRecognizer
  recognizeImage: (input: { buffer: Buffer; mimeType: string }) => Promise<string>
  maxPdfPages?: number
}

export interface ParseFileOptions {
  enhanced?: boolean
  ocr?: ParseFileOcrOptions
  /** 当文件路径无扩展名（如 blob 暂存）时显式指定类型 */
  kind?: SupportedFileKind
  /** 聊天附件等场景：有文本则跳过 OCR，加快响应 */
  pdfTextQuality?: 'strict' | 'lenient'
}

export async function parseFile(filePath: string, options?: ParseFileOptions): Promise<ParsedDocument> {
  const kind = options?.kind ?? detectFileKind(filePath)
  if (!kind) {
    throw new Error(`暂不支持该文件类型: ${filePath}`)
  }

  const title = defaultTitle(filePath)
  const mimeType = mimeTypeForKind(kind, filePath)

  switch (kind) {
    case 'markdown':
    case 'text':
    case 'csv': {
      const plainText = readFileSync(filePath, 'utf8').trim()
      if (!plainText) throw new Error('文件内容为空')
      return { title, plainText, mimeType, kind }
    }
    case 'pdf': {
      const plainText = await extractPdfPlainText(filePath, {
        preferPdfJs: Boolean(options?.enhanced),
        textQuality: options?.pdfTextQuality,
        ocr:
          options?.ocr?.enabled && options.ocr.recognizePage
            ? {
                recognizePage: options.ocr.recognizePage,
                maxPages: options.ocr.maxPdfPages,
              }
            : undefined,
      })
      return { title, plainText, mimeType, kind }
    }
    case 'image': {
      if (!options?.ocr?.enabled || !options.ocr.recognizeImage) {
        throw new Error('图片文件需要开启 OCR 识别后才能导入知识库')
      }
      const buffer = readFileSync(filePath)
      const plainText = (await options.ocr.recognizeImage({ buffer, mimeType })).trim()
      if (!plainText) throw new Error('图片 OCR 未识别到文字内容')
      return { title, plainText, mimeType, kind }
    }
    case 'doc': {
      const extractor = new WordExtractor()
      const extracted = await extractor.extract(filePath)
      const plainText = [
        extracted.getBody(),
        extracted.getFootnotes(),
        extracted.getEndnotes(),
      ]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join('\n\n')
      if (!plainText) throw new Error('DOC 未提取到文本内容')
      return { title, plainText, mimeType, kind }
    }
    case 'wps':
      throw new Error('WPS 文字 (.wps) 需先转换为 docx 后再解析正文')
    case 'docx': {
      if (options?.enhanced) {
        const htmlResult = await mammoth.convertToHtml({ path: filePath })
        const extracted = htmlToPlainText(htmlResult.value)
        if (extracted.plainText) {
          return {
            title: extracted.title || title,
            plainText: extracted.plainText,
            mimeType,
            kind,
          }
        }
      }
      const result = await mammoth.extractRawText({ path: filePath })
      const plainText = result.value.trim()
      if (!plainText) throw new Error('DOCX 未提取到文本内容')
      return { title, plainText, mimeType, kind }
    }
    case 'xls':
    case 'xlsx': {
      const plainText = extractSpreadsheetPlainText(filePath)
      if (!plainText) throw new Error('表格未提取到文本内容')
      return { title, plainText, mimeType, kind }
    }
    case 'pptx': {
      const plainText = await extractPptxPlainText(filePath)
      if (!plainText) throw new Error('PPTX 未提取到文本内容')
      return { title, plainText, mimeType, kind }
    }
    case 'html': {
      const html = readFileSync(filePath, 'utf8')
      const extracted = htmlToPlainText(html)
      if (!extracted.plainText) throw new Error('HTML 未提取到文本内容')
      return {
        title: extracted.title || title,
        plainText: extracted.plainText,
        mimeType,
        kind,
      }
    }
    case 'epub': {
      const plainText = await extractEpubPlainText(filePath)
      if (!plainText) throw new Error('EPUB 未提取到文本内容')
      return { title, plainText, mimeType, kind }
    }
  }
}

export { isImageFilePath }
