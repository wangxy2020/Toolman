import { describe, expect, it } from 'vitest'
import { VoiceSynthesizeInputSchema } from '@toolman/shared'

describe('edge TTS IPC schemas', () => {
  it('accepts chinese neural voice input', () => {
    const parsed = VoiceSynthesizeInputSchema.parse({
      text: '你好。',
      voice: 'zh-CN-XiaoxiaoNeural',
    })
    expect(parsed.voice).toBe('zh-CN-XiaoxiaoNeural')
    expect(parsed.text).toBe('你好。')
  })
})
