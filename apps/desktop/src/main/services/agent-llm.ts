import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import {
  MessageTranslateInputSchema,
  MessageDiagnoseInputSchema,
} from '@toolman/shared'

import { getProviderConfig, parseModelId } from './provider.service'

const gateway = createModelGateway()

const TRANSLATION_LANGUAGE_LABELS = {
  zh: 'Simplified Chinese',
  en: 'English',
} as const

export async function translateText(input: unknown) {
  const data = MessageTranslateInputSchema.parse(input)
  const { providerId, model } = parseModelId(data.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
  }

  const targetLabel = TRANSLATION_LANGUAGE_LABELS[data.targetLanguage]
  const prompt = [
    `Translate the following text into ${targetLabel}.`,
    'Output only the translated text without explanations, quotes, or markdown fences.',
    '',
    data.text,
  ].join('\n')

  let translated = ''
  for await (const chunk of gateway.chatStream(providerConfig, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 4096,
  })) {
    if (chunk.type === 'text-delta' && chunk.text) {
      translated += chunk.text
    }
  }

  return {
    text: translated.trim(),
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
  }
}

export async function diagnoseError(input: unknown) {
  const data = MessageDiagnoseInputSchema.parse(input)
  const { providerId, model } = parseModelId(data.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
  }

  const prompt = [
    '你是 Toolman 桌面聊天应用的技术支持助手。',
    '请用简体中文分析以下错误，给出简洁、可操作的诊断。',
    '使用 Markdown，包含两个小节：',
    '1. **原因分析** — 说明发生了什么',
    '2. **解决方案** — 列出用户可立即尝试的步骤',
    '不要复述完整堆栈，聚焦用户能做什么。',
    '',
    '---',
    data.errorSummary,
  ].join('\n')

  let diagnosis = ''
  for await (const chunk of gateway.chatStream(providerConfig, {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    maxTokens: 2048,
  })) {
    if (chunk.type === 'text-delta' && chunk.text) {
      diagnosis += chunk.text
    }
  }

  return { text: diagnosis.trim() }
}
