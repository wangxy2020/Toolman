import { describe, expect, it } from 'vitest'

import { buildWechatAuthorizeUrl } from './wechat-oauth.service'

describe('wechat-oauth.service', () => {
  it('builds qrconnect authorize url', () => {
    const url = buildWechatAuthorizeUrl({
      appId: 'wx123',
      redirectUri: 'http://127.0.0.1:47823/auth/wechat/callback',
      state: 'state-1',
    })
    expect(url).toContain('open.weixin.qq.com/connect/qrconnect')
    expect(url).toContain('appid=wx123')
    expect(url).toContain(encodeURIComponent('http://127.0.0.1:47823/auth/wechat/callback'))
    expect(url).toContain('state=state-1')
  })
})
