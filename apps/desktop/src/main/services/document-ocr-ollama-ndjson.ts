/** glm-ocr / llama.cpp abort when a page image makes the model loop. */
export function isOcrTokenRepeatMessage(message: string): boolean {
  return /token repeat limit/i.test(message)
}

export function buildOllamaOcrGenerateOptions(retry = false): {
  temperature: number
  num_ctx: number
  num_predict: number
  repeat_penalty: number
  repeat_last_n: number
} {
  // 8192 tokens is far past a page of OCR and is what fuels token-repeat aborts.
  if (retry) {
    return {
      temperature: 0.2,
      num_ctx: 4096,
      num_predict: 256,
      repeat_penalty: 1.35,
      repeat_last_n: 64,
    }
  }
  return {
    temperature: 0,
    num_ctx: 4096,
    num_predict: 384,
    repeat_penalty: 1.18,
    repeat_last_n: 64,
  }
}

/**
 * Keep text streamed before Ollama aborts a looping page.
 * Returns the salvage text, or null when the caller should throw.
 */
export function salvageOllamaOcrAfterError(errorMessage: string, accumulatedText: string): string | null {
  const text = accumulatedText.trim()
  if (text && isOcrTokenRepeatMessage(errorMessage)) return text
  return null
}

export function consumeOllamaNdjsonLine(
  line: string,
  acc: { text: string },
): { kind: 'ok' | 'done' } | { kind: 'error'; message: string } {
  const trimmed = line.trim()
  if (!trimmed) return { kind: 'ok' }
  let payload: {
    response?: string
    message?: { content?: string; thinking?: string }
    error?: string
    done?: boolean
  }
  try {
    payload = JSON.parse(trimmed) as typeof payload
  } catch {
    return { kind: 'ok' }
  }
  if (payload.error) return { kind: 'error', message: payload.error }
  acc.text += payload.response || payload.message?.content || payload.message?.thinking || ''
  return { kind: payload.done ? 'done' : 'ok' }
}
