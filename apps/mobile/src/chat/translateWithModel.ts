import type { ModelConfig } from '../state/MobileAppContext'
import { completeChatOnce } from './completeChatOnce'

/** Translate via the configured chat model (same contract as desktop MessageTranslate). */
export async function translateWithChatModel(options: {
  config: ModelConfig
  text: string
  targetLang: string
  signal?: AbortSignal
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const source = options.text.trim()
  if (!source) return { ok: false, message: '没有可翻译的内容' }

  return completeChatOnce({
    config: options.config,
    signal: options.signal,
    messages: [
      {
        role: 'system',
        content: `You are a translation engine. Translate into ${options.targetLang}. Output only the translation, without notes.`,
      },
      {
        role: 'user',
        content: source,
      },
    ],
  })
}
