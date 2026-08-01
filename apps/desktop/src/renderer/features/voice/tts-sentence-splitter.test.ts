import { describe, expect, it } from 'vitest'
import { TtsSentenceSplitter } from './tts-sentence-splitter'
import { sanitizeSpeakableText } from './sanitize-speakable-text'

describe('TtsSentenceSplitter', () => {
  it('emits on Chinese sentence boundaries', () => {
    const splitter = new TtsSentenceSplitter()
    expect(splitter.append('你好。')).toEqual(['你好。'])
    expect(splitter.append('世界！继续')).toEqual(['世界！'])
    expect(splitter.flush()).toEqual(['继续'])
  })

  it('emits on English punctuation with following space', () => {
    const splitter = new TtsSentenceSplitter()
    const parts = splitter.append('Hello world. Next sentence')
    expect(parts).toEqual(['Hello world.'])
    expect(splitter.flush()).toEqual(['Next sentence'])
  })

  it('force-splits long text without punctuation', () => {
    const splitter = new TtsSentenceSplitter()
    const long = `${'词'.repeat(40)}，${'续'.repeat(50)}`
    const parts = splitter.append(long)
    expect(parts.length).toBeGreaterThan(0)
    const remainder = splitter.flush()
    expect([...parts, ...remainder].join('').replace(/\s/g, '').length).toBe(
      long.replace(/\s/g, '').length,
    )
  })
})

describe('sanitizeSpeakableText', () => {
  it('strips code fences and markdown links', () => {
    const text = sanitizeSpeakableText('见 [文档](https://x.test)\n```ts\nconst a=1\n```\n结束。')
    expect(text).not.toContain('```')
    expect(text).toContain('文档')
    expect(text).toContain('结束。')
  })
})
