import { describe, expect, it } from 'vitest'
import {
  formatBoardMessageTitle,
  formatNewsPreview,
  formatTaskBudget,
  htmlToPlainText,
  joinCommunityMeta,
  resolveCommunityItemBody,
  sortCommunityItems,
} from './communityListFormat'

describe('communityListFormat', () => {
  it('uses the first line as the board title', () => {
    expect(formatBoardMessageTitle('第一行标题\n后面还有很多正文内容')).toBe('第一行标题')
  })

  it('clamps previews like the desktop cards', () => {
    const long = '字'.repeat(140)
    expect(formatNewsPreview(long)).toHaveLength(121)
    expect(formatNewsPreview(long).endsWith('…')).toBe(true)
  })

  it('joins meta with middle dots and drops empty parts', () => {
    expect(joinCommunityMeta(['作者', '', '8月15日'])).toBe('作者 · 8月15日')
  })

  it('formats CNY task budgets', () => {
    expect(formatTaskBudget(1200, 'CNY')).toBe('¥1200')
    expect(formatTaskBudget(0, 'CNY')).toBe('')
  })

  it('sorts community items by newest then title', () => {
    const items = [
      { createdAt: 10, title: '乙' },
      { createdAt: 20, title: 'B' },
      { createdAt: 20, title: 'A' },
    ]
    expect(sortCommunityItems(items).map((item) => item.title)).toEqual(['A', 'B', '乙'])
  })

  it('converts HTML to readable plain text for detail bodies', () => {
    expect(htmlToPlainText('<p>第一段</p><p>第二段<br/>换行</p>')).toContain('第一段')
    expect(htmlToPlainText('<p>第一段</p><p>第二段</p>')).toContain('第二段')
  })

  it('prefers full body over truncated description', () => {
    expect(
      resolveCommunityItemBody({
        body: '完整留言正文',
        description: '截断…',
        title: '标题',
      }),
    ).toBe('完整留言正文')
  })
})
