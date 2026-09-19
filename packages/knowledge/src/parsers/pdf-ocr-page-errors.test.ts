import { describe, expect, it } from 'vitest'
import {
  isCancelledOcrError,
  isOcrTokenRepeatError,
  isSkippablePdfOcrPageError,
} from './pdf-ocr-page-errors.js'

describe('pdf-ocr-page-errors', () => {
  const tokenRepeat = new Error(
    'Ollama 请求失败 (500): {"error":"prediction aborted, token repeat limit reached"}',
  )

  it('treats glm-ocr token-repeat as a skippable page failure', () => {
    expect(isOcrTokenRepeatError(tokenRepeat)).toBe(true)
    expect(isSkippablePdfOcrPageError(tokenRepeat)).toBe(true)
  })

  it('does not skip cancel or missing OCR provider', () => {
    expect(isCancelledOcrError(new Error('索引任务已取消'))).toBe(true)
    expect(isSkippablePdfOcrPageError(new Error('索引任务已取消'))).toBe(false)
    expect(isSkippablePdfOcrPageError(new Error('未找到可用的 OCR / 视觉模型。'))).toBe(false)
  })

  it('skips empty-page and timeout OCR errors', () => {
    expect(isSkippablePdfOcrPageError(new Error('视觉模型未返回可识别的文字内容'))).toBe(true)
    expect(isSkippablePdfOcrPageError(new Error('OCR 视觉模型响应超时，请检查 Ollama 是否可用'))).toBe(
      true,
    )
  })
})
