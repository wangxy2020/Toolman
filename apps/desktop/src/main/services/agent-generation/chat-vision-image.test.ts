import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@toolman/model-gateway'

const nativeImageMocks = vi.hoisted(() => {
  let lastResize: { width: number; height: number } | null = null
  return {
    lastResize: () => lastResize,
    reset: () => {
      lastResize = null
    },
    createFromBuffer: (buffer: Buffer) => {
      const large = buffer.length > 200
      return {
        isEmpty: () => buffer.length === 0,
        getSize: () => (large ? { width: 2400, height: 1800 } : { width: 800, height: 600 }),
        resize: ({ width, height }: { width: number; height: number }) => {
          lastResize = { width, height }
          return {
            toJPEG: () => Buffer.alloc(Math.max(32, Math.floor((width * height) / 80)), 7),
          }
        },
        toJPEG: () => Buffer.alloc(64, 3),
      }
    },
  }
})

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: nativeImageMocks.createFromBuffer,
  },
}))

import {
  CHAT_VISION_MAX_SIDE,
  chatVisionTargetSize,
  downscaleImageDataUrl,
  parseExceedContextSizeError,
} from './chat-vision-image'
import { compactChatMessagesForContextRetry } from './chat-context-fit'

describe('chatVisionTargetSize', () => {
  it('scales a landscape photo onto the long-side cap', () => {
    expect(chatVisionTargetSize(2400, 1800, 1024)).toEqual({ width: 1024, height: 768 })
    expect(chatVisionTargetSize(800, 600, 1024)).toBeNull()
  })
})

describe('downscaleImageDataUrl', () => {
  beforeEach(() => {
    nativeImageMocks.reset()
  })

  it('shrinks a large photo below the vision long-side cap', () => {
    const original = `data:image/jpeg;base64,${Buffer.alloc(400, 9).toString('base64')}`
    const resized = downscaleImageDataUrl(original)
    expect(resized.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(resized).not.toBe(original)
    expect(nativeImageMocks.lastResize()).toEqual({
      width: CHAT_VISION_MAX_SIDE,
      height: 768,
    })
  })
})

describe('parseExceedContextSizeError', () => {
  it('reads llama.cpp context overflow metadata', () => {
    const message =
      'Provider 请求失败 (400): {"error":{"code":400,"message":"request (33094 tokens) exceeds the available context size (32768 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":33094,"n_ctx":32768}}'
    expect(parseExceedContextSizeError(message)).toEqual({
      promptTokens: 33094,
      contextSize: 32768,
    })
  })
})

describe('compactChatMessagesForContextRetry', () => {
  it('keeps system + latest user turn and drops history', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'ok' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
        ],
      },
    ]
    const compacted = compactChatMessagesForContextRetry(messages)
    expect(compacted?.map((message) => message.role)).toEqual(['system', 'user'])
    expect(compacted?.[1]?.content).toEqual(messages[3]?.content)
  })

  it('returns null when there is nothing left to drop', () => {
    expect(
      compactChatMessagesForContextRetry([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'now' },
      ]),
    ).toBeNull()
  })
})
