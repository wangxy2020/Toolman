import { describe, expect, it } from 'vitest'

import { stripP2pGroupPrefixedResourceName } from './knowledge-mirror.js'

describe('stripP2pGroupPrefixedResourceName', () => {
  it('strips bracketed group prefix', () => {
    expect(stripP2pGroupPrefixedResourceName('测试群', '[测试群] 默认文件夹')).toBe('默认文件夹')
  })

  it('strips plain group prefix', () => {
    expect(stripP2pGroupPrefixedResourceName('测试群', '测试群 默认文件夹')).toBe('默认文件夹')
  })

  it('returns original name when no prefix matches', () => {
    expect(stripP2pGroupPrefixedResourceName('测试群', '默认文件夹')).toBe('默认文件夹')
  })
})
