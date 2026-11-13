import { createModelGateway, ProviderError } from '@toolman/model-gateway'
import {
  MessageTranslateInputSchema,
  MessageDiagnoseInputSchema,
} from '@toolman/shared'

import { getProviderConfig, parseModelId } from './provider.service'
import {
  claimDesktopTrialLlm,
  isCloudProviderWithoutUserKey,
  recordDesktopTrialLlmUsage,
} from './trial-llm.service'
import { splitTranslationSegments } from './translation-segments'

const gateway = createModelGateway()

const TRANSLATION_LANGUAGE_LABELS = {
  zh: 'Simplified Chinese',
  en: 'English',
} as const

const TRANSLATE_TIMEOUT_MS = 120_000
/** Below this size, always use a single model call. */
const SINGLE_SHOT_MAX_CHARS = 6000
/** Max concurrent segment requests per translate call. */
const SEGMENT_CONCURRENCY = 3

function buildTranslatePrompt(text: string, targetLabel: string): string {
  const hasTable = /<table\b/i.test(text) || /^\s*\|.+\|\s*$/m.test(text)
  const rules = [
    `Translate the following document excerpt into ${targetLabel}.`,
    'Output only the translation.',
    'Preserve paragraph breaks. Merge single-word wrapped lines into normal sentences.',
    hasTable
      ? 'The source contains a table (HTML <table> or Markdown pipe table). Keep the same table markup and cell structure; translate only cell text. Do not flatten the table into prose.'
      : null,
    'No explanations, notes, or markdown fences.',
    '',
    text,
  ]
  return rules.filter((line): line is string => line !== null).join('\n')
}

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

  // Estimate output budget from content size, not raw line count — ODL often
  // emits one-token lines which inflated timeouts and still truncated prose.
  const charBudget = Math.ceil(text.length * 1.2)
  const maxTokens = Math.min(4096, Math.max(768, Math.ceil(charBudget / 2)))
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)
  const extraBody = providerConfig.type === 'ollama' ? { think: false } : undefined

  let result
  try {
    result = await withTimeout(
      gateway.chatComplete(providerConfig, {
        model,
        messages: [
          {
            role: 'user',
            content: buildTranslatePrompt(text, targetLabel),
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

async function translateSegmentsParallel(options: {
  segments: string[]
  model: string
  providerConfig: NonNullable<ReturnType<typeof getProviderConfig>>
  targetLabel: string
}): Promise<string[]> {
  const { segments, model, providerConfig, targetLabel } = options
  const results = new Array<string>(segments.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < segments.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await translateSegment({
        text: segments[index]!,
        model,
        providerConfig,
        targetLabel,
      })
    }
  }

  const workerCount = Math.min(SEGMENT_CONCURRENCY, segments.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export async function translateText(input: unknown) {
  const data = MessageTranslateInputSchema.parse(input)
  const { providerId, model: parsedModel } = parseModelId(data.modelId)
  let providerConfig = getProviderConfig(providerId)
  if (!providerConfig) {
    throw new ProviderError(`Provider ${providerId} 未找到或未启用`)
  }

  // Match chat generation: keyless cloud providers (e.g. DeepSeek) use the
  // desktop trial key so translation does not hang/fail after source loads.
  let model = parsedModel
  let usedTrialLlm = false
  if (isCloudProviderWithoutUserKey(providerConfig)) {
    const trial = claimDesktopTrialLlm()
    if (!trial.ok) throw new ProviderError(trial.message)
    usedTrialLlm = true
    providerConfig = {
      type: 'openai_compatible',
      baseUrl: trial.baseUrl,
      apiKey: trial.apiKey,
    }
    model = trial.model
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

  const translatedParts = await translateSegmentsParallel({
    segments,
    model,
    providerConfig,
    targetLabel,
  })

  if (usedTrialLlm) {
    recordDesktopTrialLlmUsage(
      Math.max(1, Math.ceil((sourceText.length + translatedParts.join('').length) / 4)),
    )
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
