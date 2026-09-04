import { describe, expect, it } from 'vitest'

import { formatCommunityHubError } from './community-hub-error-utils'

describe('formatCommunityHubError', () => {
  it('maps hub bearer-token errors to a readable status', () => {
    expect(formatCommunityHubError('missing Authorization Bearer token')).toBe(
      '社区身份未就绪，请刷新后重试。若仍失败，请重启桌面端',
    )
    expect(
      formatCommunityHubError('missing Authorization Bearer token or X-Community-User-Id'),
    ).toContain('社区身份未就绪')
  })

  it('maps rate-limit errors', () => {
    expect(formatCommunityHubError('too many requests')).toBe(
      '社区服务请求过于频繁，请稍后再试',
    )
  })

  it('leaves unrelated messages unchanged', () => {
    expect(formatCommunityHubError('RSS fetch failed')).toBe('RSS fetch failed')
  })
})
