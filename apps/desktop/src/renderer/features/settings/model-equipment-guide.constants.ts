import type { AppLanguage } from './app-settings'

export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'
export const DEEPSEEK_V3_API_KEY_URL = 'https://platform.deepseek.com/api_keys'

export const MODEL_GUIDE_RECOMMENDATIONS = {
  embedding: {
    modelId: 'bge-m3:latest',
    pullCommand: 'ollama pull bge-m3:latest',
  },
  ocr: {
    modelId: 'glm-ocr:latest',
    pullCommand: 'ollama pull glm-ocr:latest',
  },
} as const

export const MODEL_GUIDE_DEFAULT_CHAT = {
  'zh-CN': {
    kind: 'deepseek' as const,
    installUrl: DEEPSEEK_V3_API_KEY_URL,
  },
  en: {
    kind: 'ollama' as const,
    modelId: 'gemma4:latest',
  },
} as const

export type ModelGuideStatus = 'idle' | 'checking' | 'ready' | 'missing'

export function resolveDefaultChatGuide(language: AppLanguage) {
  return language === 'en' ? MODEL_GUIDE_DEFAULT_CHAT.en : MODEL_GUIDE_DEFAULT_CHAT['zh-CN']
}

export function modelGuideStatusMatches(installedIds: readonly string[], targetModelId: string): boolean {
  const normalized = targetModelId.trim().toLowerCase()
  return installedIds.some((id) => {
    const value = id.trim().toLowerCase()
    return value === normalized || value.startsWith(`${normalized.split(':')[0]}:`)
  })
}
