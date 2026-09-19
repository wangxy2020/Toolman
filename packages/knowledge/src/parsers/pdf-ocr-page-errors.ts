/** glm-ocr / llama.cpp abort when a page image makes the model loop. */
export function isOcrTokenRepeatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /token repeat limit/i.test(message)
}

export function isCancelledOcrError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('索引任务已取消')
}

/**
 * One bad scan page must not fail a 200-page glm-ocr job.
 * Cancel and missing-provider errors still abort the whole parse.
 */
export function isSkippablePdfOcrPageError(error: unknown): boolean {
  if (isCancelledOcrError(error)) return false
  const message = error instanceof Error ? error.message : String(error)
  if (/未找到可用的 OCR|OCR Provider 不可用/.test(message)) return false
  return (
    isOcrTokenRepeatError(error) ||
    /视觉模型未返回可识别/.test(message) ||
    /OCR 视觉模型响应超时/.test(message) ||
    /Ollama 请求失败 \(500\)/.test(message)
  )
}
