import { afterEach, describe, expect, it } from 'vitest'

import {
  consumeWechatMergeToken,
  createWechatMergeToken,
  resetWechatMergeTokensForTests,
} from './wechat-merge-pending.service'

describe('wechat-merge-pending.service', () => {
  afterEach(() => {
    resetWechatMergeTokensForTests()
  })

  it('stores and consumes merge tokens for matching phone', () => {
    const wechat = {
      subjectId: 'union-1',
      openId: 'open-1',
      unionId: 'union-1',
      accessToken: 'token',
      refreshToken: null,
      expiresIn: 7200,
      nickname: 'Tester',
      avatarUrl: null,
    }
    const token = createWechatMergeToken(wechat, '+8613800138000')
    const consumed = consumeWechatMergeToken(token, '+8613800138000')
    expect(consumed.subjectId).toBe('union-1')
  })

  it('rejects mismatched phone on merge', () => {
    const token = createWechatMergeToken(
      {
        subjectId: 'union-1',
        openId: 'open-1',
        unionId: 'union-1',
        accessToken: 'token',
        refreshToken: null,
        expiresIn: 7200,
        nickname: 'Tester',
        avatarUrl: null,
      },
      '+8613800138000',
    )
    expect(() => consumeWechatMergeToken(token, '+8613900139000')).toThrow('请输入已绑定账户的手机号')
  })
})
