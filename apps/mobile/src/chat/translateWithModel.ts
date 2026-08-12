import type { ModelConfig } from '../state/MobileAppContext'
import { streamChatCompletion } from './streamChat'

/** Translate via the configured chat model (mobile stand-in for desktop translate IPC). */
export async function translateWithChatModel(options: {
  config: ModelConfig
  text: string
  targetLang: string
  signal?: AbortSignal
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const source = options.text.trim()
  if (!source) return { ok: false, message: '没有可翻译的内容' }

  let out = ''
  let failed: string | null = null
  await streamChatCompletion({
    config: options.config,
    signal: options.signal,
    messages: [
      {
        role: 'system',
        content:
          'You are a translation engine. Translate the user text into the requested language. Output only the translation, without notes.',
      },
      {
        role: 'user',
        content: `Target language: ${options.targetLang}\n\nText:\n${source}`,
      },
    ],
    handlers: {
      onDelta: (delta) => {
        out += delta
      },
      onDone: () => undefined,
      onError: (message) => {
        failed = message
      },
    },
  })
  if (failed) return { ok: false, message: failed }
  const text = out.trim()
  if (!text) return { ok: false, message: '翻译结果为空' }
  return { ok: true, text }
}
