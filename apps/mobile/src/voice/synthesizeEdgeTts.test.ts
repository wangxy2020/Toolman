import { describe, expect, it } from 'vitest'

import { parseTtsSynthesizeBody } from './synthesizeEdgeTts'

describe('parseTtsSynthesizeBody', () => {
  it('requires text', () => {
    expect(parseTtsSynthesizeBody({})).toEqual({ error: 'text required' })
  })

  it('defaults the Xiaoxiao neural voice', () => {
    expect(parseTtsSynthesizeBody({ text: '你好' })).toEqual({
      text: '你好',
      voice: 'zh-CN-XiaoxiaoNeural',
    })
  })
})
