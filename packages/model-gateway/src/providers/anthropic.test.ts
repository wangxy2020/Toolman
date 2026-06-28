import { describe, expect, it } from 'vitest'

import { formatAnthropicMessages } from './anthropic.js'

describe('formatAnthropicMessages', () => {
  it('preserves base64 images in user messages', () => {
    const formatted = formatAnthropicMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this chart' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
        ],
      },
    ])

    expect(formatted).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this chart' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'abc123' },
          },
        ],
      },
    ])
  })
})
