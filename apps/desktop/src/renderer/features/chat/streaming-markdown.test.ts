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
})
