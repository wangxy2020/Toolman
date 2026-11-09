import {
  DEFAULT_EDGE_TTS_VOICE,
  VoiceListVoicesInputSchema,
  VoiceListVoicesOutputSchema,
  VoiceSynthesizeInputSchema,
  VoiceSynthesizeOutputSchema,
  ipcErr,
  ipcOk,
  toErrorMessage,
  type IpcResult,
  type VoiceListVoicesInput,
  type VoiceListVoicesOutput,
  type VoiceSynthesizeInput,
  type VoiceSynthesizeOutput,
} from '@toolman/shared'
import { UniversalEdgeTTS, listVoicesUniversal } from 'edge-tts-universal'
import { logStructured } from '../structured-log.service'

const SYNTHESIZE_TIMEOUT_MS = 25_000
const MAX_SYNTHESIZE_ATTEMPTS = 4
const MIN_SYNTHESIZE_GAP_MS = 350

/** Serialize Edge WSS handshakes — parallel sentence synth triggers HTTP 429. */
let synthesizeChain: Promise<unknown> = Promise.resolve()
let lastSynthesizeStartedAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientEdgeError(message: string): boolean {
  return /429|503|502|504|timeout|超时|ECONNRESET|ETIMEDOUT|socket|Handshake rejected/i.test(
    message,
  )
}

function retryDelayMs(attempt: number, message: string): number {
  const base = /429/.test(message) ? 1_200 : 500
  return base * 2 ** Math.max(0, attempt - 1)
}

async function synthesizeOnce(input: VoiceSynthesizeInput): Promise<VoiceSynthesizeOutput> {
  const voice = input.voice?.trim() || DEFAULT_EDGE_TTS_VOICE
  const tts = new UniversalEdgeTTS(input.text, voice, {
    ...(input.rate ? { rate: input.rate } : {}),
    ...(input.volume ? { volume: input.volume } : {}),
    ...(input.pitch ? { pitch: input.pitch } : {}),
  })
  const result = await Promise.race([
    tts.synthesize(),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Edge TTS 超时（${SYNTHESIZE_TIMEOUT_MS}ms）`)),
        SYNTHESIZE_TIMEOUT_MS,
      )
    }),
  ])
  const bytes = Buffer.from(await result.audio.arrayBuffer())
  if (bytes.length < 64) {
    throw new Error('Edge TTS 返回音频过短')
  }
  const mimeType = result.audio.type || 'audio/mpeg'
  return VoiceSynthesizeOutputSchema.parse({
    mimeType,
    audioBase64: bytes.toString('base64'),
    voice,
  })
}

async function synthesizeWithRetry(input: VoiceSynthesizeInput): Promise<VoiceSynthesizeOutput> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_SYNTHESIZE_ATTEMPTS; attempt += 1) {
    const gap = MIN_SYNTHESIZE_GAP_MS - (Date.now() - lastSynthesizeStartedAt)
    if (gap > 0) await sleep(gap)
    lastSynthesizeStartedAt = Date.now()
    try {
      return await synthesizeOnce(input)
    } catch (error) {
      lastError = error
      const message = toErrorMessage(error, 'Edge TTS 合成失败')
      const canRetry = attempt < MAX_SYNTHESIZE_ATTEMPTS && isTransientEdgeError(message)
      logStructured(
        'voice',
        'warn',
        canRetry
          ? `Edge TTS synthesize failed (attempt ${attempt}/${MAX_SYNTHESIZE_ATTEMPTS}): ${message}`
          : `Edge TTS synthesize failed: ${message}`,
      )
      if (!canRetry) break
      await sleep(retryDelayMs(attempt, message))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(toErrorMessage(lastError, 'Edge TTS 合成失败'))
}

export async function synthesizeEdgeTts(
  rawInput: unknown,
): Promise<IpcResult<VoiceSynthesizeOutput>> {
  const run = async (): Promise<IpcResult<VoiceSynthesizeOutput>> => {
    try {
      const input = VoiceSynthesizeInputSchema.parse(rawInput) as VoiceSynthesizeInput
      const output = await synthesizeWithRetry(input)
      return ipcOk(output)
    } catch (error) {
      const message = toErrorMessage(error, 'Edge TTS 合成失败')
      return ipcErr({
        code: 'PROVIDER_ERROR',
        message,
        retryable: isTransientEdgeError(message),
      })
    }
  }

  const pending = synthesizeChain.then(run, run)
  synthesizeChain = pending.then(
    () => undefined,
    () => undefined,
  )
  return pending
}

export async function listEdgeTtsVoices(
  rawInput: unknown,
): Promise<IpcResult<VoiceListVoicesOutput>> {
  try {
    const input = VoiceListVoicesInputSchema.parse(rawInput ?? {}) as VoiceListVoicesInput
    const all = await listVoicesUniversal()
    const prefix = input.localePrefix?.trim().toLowerCase()
    const filtered = prefix
      ? all.filter((voice) => voice.Locale?.toLowerCase().startsWith(prefix))
      : all
    const voices = filtered
      .map((voice) => ({
        shortName: voice.ShortName,
        friendlyName: voice.FriendlyName || voice.ShortName,
        locale: voice.Locale,
        gender: voice.Gender,
      }))
      .sort((a, b) => a.shortName.localeCompare(b.shortName))
    return ipcOk(VoiceListVoicesOutputSchema.parse({ voices }))
  } catch (error) {
    return ipcErr({
      code: 'PROVIDER_ERROR',
      message: toErrorMessage(error, '获取 Edge TTS 音色失败'),
      retryable: true,
    })
  }
}
