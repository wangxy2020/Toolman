import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { formatZodError, toErrorMessage } from './error-message.js'

describe('toErrorMessage', () => {
  it('returns Error message', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('returns fallback for non-Error', () => {
    expect(toErrorMessage('oops', 'fallback')).toBe('fallback')
  })

  it('formats Zod validation as friendly Chinese text', () => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse({ name: '' })
    if (parsed.success) {
      throw new Error('expected validation failure')
    }
    expect(toErrorMessage(parsed.error, 'fallback')).toBe('名称不能为空')
  })

  it('unwraps fetch failed with ECONNREFUSED', () => {
    expect(
      toErrorMessage(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }), 'fallback'),
    ).toContain('无法连接本地服务')
  })

  it('uses invite-specific message for empty inviteToken', () => {
    const parsed = z.object({ inviteToken: z.string().min(1) }).safeParse({ inviteToken: '' })
    if (parsed.success) {
      throw new Error('expected validation failure')
    }
    expect(formatZodError(parsed.error)).toBe(
      '群组邀请初始化失败，请检查网络连接或更新到最新版本',
    )
  })
})
