import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import {
  MessageTranslateInputSchema,
  MessageDiagnoseInputSchema,
} from '@toolman/shared'

import { getProviderConfig, parseModelId } from './provider.service'
import { splitTranslationSegments } from './translation-segments'

const gateway = createModelGateway()

const TRANSLATION_LANGUAGE_LABELS = {
  zh: 'Simplified Chinese',
  en: 'English',
} as const

const TRANSLATE_TIMEOUT_MS = 60_000
/** Below this size, always use a single model call. */
const SINGLE_SHOT_MAX_CHARS = 4000

function detectJoinSeparator(text: string): '\n' | '\n\n' {
  return /\n\s*\n/.test(text) ? '\n\n' : '\n'
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ProviderError(message, true))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function translateSegment(options: {
  text: string
  model: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  targetLabel: string
}): Promise<string> {
  const { text, model, providerConfig, targetLabel } = options

  const lineCount = text.split('\n').filter((line) => line.trim()).length
  const maxTokens = Math.min(2048, Math.max(512, lineCount * 48))
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)
  const extraBody =
    providerConfig.type === 'ollama'
      ? { think: false, options: { num_predict: maxTokens, temperature: 0.1 } }
      : undefined

  let result
  try {
    result = await withTimeout(
      gateway.chatComplete(providerConfig, {
        model,
        messages: [
          {
            role: 'user',
            content: [
              `Translate into ${targetLabel}.`,
              'Output only the translation.',
              'Keep the same line breaks (one input line → one output line).',
              'No explanations.',
              '',
              text,
            ].join('\n'),
          },
        ],
        temperature: 0.1,
        maxTokens,
        ...(extraBody ? { extraBody } : {}),
        signal: controller.signal,
      }),
      TRANSLATE_TIMEOUT_MS,
      '翻译超时，请检查模型服务后重试',
    )
  } finally {
    clearTimeout(abortTimer)
  }

  const output = result.content.trim()
  if (!output) {
    throw new ProviderError('翻译结果为空，请重试或更换模型')
  }
  if (result.finishReason === 'length') {
    throw new ProviderError('翻译输出被截断，请缩短原文后重试，或更换上下文更长的模型')
  }
  return output
}

export async function translateText(input: unknown) {
  const data = MessageTranslateInputSchema.parse(input)
  const { providerId, model } = parseModelId(data.modelId)
  const providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
  }

  const targetLabel = TRANSLATION_LANGUAGE_LABELS[data.targetLanguage]
  const sourceText = data.text.replace(/\r\n/g, '\n').trim()
  if (!sourceText) {
    throw new ProviderError('没有可翻译的内容')
  }

  // Contrast / short text: always one model call.
  const segments =
    sourceText.length <= SINGLE_SHOT_MAX_CHARS
      ? [sourceText]
      : splitTranslationSegments(sourceText)

  if (segments.length === 0) {
    throw new ProviderError('没有可翻译的内容')
  }

  const translatedParts: string[] = []
  for (let index = 0; index < segments.length; index += 1) {
    const part = await translateSegment({
      text: segments[index]!,
      model,
      providerConfig,
      targetLabel,
    })
    translatedParts.push(part)
  }

  return {
    text: translatedParts.join(detectJoinSeparator(sourceText)),
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
