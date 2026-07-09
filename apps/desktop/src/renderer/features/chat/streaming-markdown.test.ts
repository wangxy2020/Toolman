import { describe, expect, it } from 'vitest'
import { prepareStreamingMarkdown, stabilizeIncompleteMarkdown } from './streaming-markdown'

describe('stabilizeIncompleteMarkdown', () => {
  it('closes an unclosed fenced code block', () => {
    expect(stabilizeIncompleteMarkdown('```ts\nconst x = 1')).toBe('```ts\nconst x = 1\n```')
  })

  it('leaves balanced fences unchanged', () => {
    const input = '```ts\nconst x = 1\n```'
    expect(stabilizeIncompleteMarkdown(input)).toBe(input)
  })

  it('closes an unclosed display math block', () => {
    expect(stabilizeIncompleteMarkdown('$$a+b')).toBe('$$a+b\n$$')
  })
})

describe('prepareStreamingMarkdown', () => {
  it('sanitizes without trimming trailing whitespace', () => {
    const prepared = prepareStreamingMarkdown('段落一\n\n', true)
    expect(prepared.endsWith('\n\n')).toBe(true)
  })

  it('hides trailing table rows until separator arrives', () => {
    const input = '标题\n\n| # | 英文 | 中文 |'
    expect(prepareStreamingMarkdown(input)).toBe('标题\n')
  })

  it('keeps complete trailing tables', () => {
    const input = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    expect(prepareStreamingMarkdown(input)).toBe(input)
  })

  it('normalizes <br> inside table rows while streaming', () => {
    const input = '| A | B |\n| --- | --- |\n| 上行<br>下行 | ok |'
    expect(prepareStreamingMarkdown(input)).toBe('| A | B |\n| --- | --- |\n| 上行 · 下行 | ok |')
  })
})
