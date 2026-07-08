import { describe, expect, it } from 'vitest'

import {
  extractBase64ImagesFromContent,
  formatMessagesForOllamaNative,
  shouldUseOllamaNativeChat,
} from './ollama-native.js'

describe('shouldUseOllamaNativeChat', () => {
  it('uses native chat for qwen3 without tools', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'qwen3.5:9b',
          messages: [{ role: 'user', content: 'hi' }],
        },
      ),
    ).toBe(true)
  })

  it('uses native chat for gemma without tools', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'gemma4:26b',
          messages: [{ role: 'user', content: 'hi' }],
        },
      ),
    ).toBe(true)
  })

  it('falls back to openai-compatible path when tools are enabled', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'gemma4:26b',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [
            {
              type: 'function',
              function: { name: 'fs_read', description: 'read', parameters: {} },
            },
          ],
        },
      ),
    ).toBe(false)
  })

  it('uses native chat for glm-ocr with images', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'glm-ocr:latest',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Text Recognition:' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
              ],
            },
          ],
        },
      ),
    ).toBe(true)
  })

  it('keeps gemma image requests on openai-compatible path', () => {
    expect(
      shouldUseOllamaNativeChat(
        { type: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' },
        {
          model: 'gemma4:26b',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'describe this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
              ],
            },
          ],
        },
      ),
    ).toBe(false)
  })
})

describe('formatMessagesForOllamaNative', () => {
  it('flattens multipart user content and skips tool messages', () => {
    expect(
      formatMessagesForOllamaNative([
        { role: 'system', content: 'system prompt' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'text', text: 'world' },
          ],
        },
        { role: 'tool', content: 'ignored', tool_call_id: '1' },
      ]),
    ).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello\n\nworld' },
    ])
  })

  it('attaches raw base64 images for ollama native API', () => {
    expect(
      formatMessagesForOllamaNative([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Text Recognition:' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123+/=' } },
          ],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: 'Text Recognition:',
        images: ['abc123+/='],
      },
    ])
  })
})

describe('extractBase64ImagesFromContent', () => {
  it('strips data-url prefixes', () => {
    expect(
      extractBase64ImagesFromContent([
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,Zm9v' } },
      ]),
    ).toEqual(['Zm9v'])
  })
})
