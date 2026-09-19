import { nativeImage } from 'electron'
import type { ChatContentPart, ChatMessage } from '@toolman/model-gateway'

/** Long-side cap for images sent to local VL models (32K ctx overflows on original phone photos). */
export const CHAT_VISION_MAX_SIDE = 1024
export const CHAT_VISION_JPEG_QUALITY = 80

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const marker = ';base64,'
  const markerIndex = dataUrl.indexOf(marker)
  if (markerIndex < 0) return null
  const header = dataUrl.slice(0, markerIndex)
  const mimeType = header.startsWith('data:') ? header.slice('data:'.length) : 'image/jpeg'
  const buffer = Buffer.from(dataUrl.slice(markerIndex + marker.length), 'base64')
  if (buffer.length === 0) return null
  return { mimeType, buffer }
}

export function chatVisionTargetSize(
  width: number,
  height: number,
  maxSide = CHAT_VISION_MAX_SIDE,
): { width: number; height: number } | null {
  const longSide = Math.max(width, height, 1)
  if (longSide <= maxSide) return null
  const scale = maxSide / longSide
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Shrink a data-URL so vision patch tokens fit in a 32K local context. */
export function downscaleImageDataUrl(
  dataUrl: string,
  maxSide = CHAT_VISION_MAX_SIDE,
): string {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return dataUrl

  try {
    const image = nativeImage.createFromBuffer(parsed.buffer)
    if (image.isEmpty()) return dataUrl
    const { width, height } = image.getSize()
    const target = chatVisionTargetSize(width, height, maxSide)
    const alreadySmallJpeg =
      !target && parsed.buffer.length <= 350_000 && /jpe?g/i.test(parsed.mimeType)
    if (alreadySmallJpeg) return dataUrl

    const resized = target
      ? image.resize({ width: target.width, height: target.height, quality: 'good' })
      : image
    const jpeg = resized.toJPEG(CHAT_VISION_JPEG_QUALITY)
    if (!jpeg.length) return dataUrl
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return dataUrl
  }
}

export function chatMessagesHaveImages(messages: ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url' && part.image_url?.url),
  )
}

export function shrinkChatMessageImages(messages: ChatMessage[], maxSide: number): ChatMessage[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') return message
    const parts: ChatContentPart[] = message.content.map((part) => {
      if (part.type !== 'image_url' || !part.image_url?.url) return part
      return {
        type: 'image_url',
        image_url: { url: downscaleImageDataUrl(part.image_url.url, maxSide) },
      }
    })
    return { ...message, content: parts }
  })
}

export function parseExceedContextSizeError(message: string): {
  promptTokens: number
  contextSize: number
} | null {
  const prompt = message.match(/n_prompt_tokens["\s:]+(\d+)/)
  const ctx = message.match(/n_ctx["\s:]+(\d+)/)
  if (prompt && ctx) {
    return { promptTokens: Number(prompt[1]), contextSize: Number(ctx[1]) }
  }
  const request = message.match(
    /request \((\d+) tokens\) exceeds the available context size \((\d+) tokens\)/i,
  )
  if (request) {
    return { promptTokens: Number(request[1]), contextSize: Number(request[2]) }
  }
  if (/exceed_context_size_error/i.test(message)) {
    return { promptTokens: 0, contextSize: 0 }
  }
  return null
}
