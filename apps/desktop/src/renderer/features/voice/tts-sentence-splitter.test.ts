import { describe, expect, it } from 'vitest'
import { TtsSentenceSplitter } from './tts-sentence-splitter'
import { isSpeakableUtterance, sanitizeSpeakableText } from './sanitize-speakable-text'

describe('TtsSentenceSplitter', () => {
  it('emits on Chinese sentence boundaries', () => {
    const splitter = new TtsSentenceSplitter()
    expect(splitter.append('你好。')).toEqual(['你好。'])
    expect(splitter.append('世界！继续')).toEqual(['世界！'])
    expect(splitter.flush()).toEqual(['继续'])
  })

  it('keeps intensifier clusters like ？！ together', () => {
    const splitter = new TtsSentenceSplitter()
    expect(splitter.append('什么？！')).toEqual(['什么？！'])
    expect(splitter.flush()).toEqual([])
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

  it('strips emoji and decorative icons', () => {
    const text = sanitizeSpeakableText('你好 😊 世界 ✅ 继续')
    expect(text).not.toMatch(/😊|✅/)
    expect(text).toContain('你好')
    expect(text).toContain('世界')
    expect(text).toContain('继续')
  })

  it('drops punctuation-only lines', () => {
    const text = sanitizeSpeakableText('结束。\n。\n\n！')
    expect(text).toBe('结束。')
  })
})

describe('isSpeakableUtterance', () => {
  it('rejects bare punctuation', () => {
    expect(isSpeakableUtterance('。')).toBe(false)
    expect(isSpeakableUtterance('！')).toBe(false)
    expect(isSpeakableUtterance('...')).toBe(false)
    expect(isSpeakableUtterance('？！')).toBe(false)
  })

  it('accepts text with letters or digits', () => {
    expect(isSpeakableUtterance('你好。')).toBe(true)
    expect(isSpeakableUtterance('OK.')).toBe(true)
    expect(isSpeakableUtterance('第1章')).toBe(true)
  })
})
