import { describe, expect, it } from 'vitest'
import { markdownToEditorHtml, normalizeEditorMarkdown } from './noteRichEditor'

describe('markdownToEditorHtml', () => {
  it('renders inline markdown as formatted html', () => {
    const html = markdownToEditorHtml('**The** <u>quoted</u>')
    expect(html).toContain('<strong>The</strong>')
    expect(html).toContain('<u>quoted</u>')
    expect(html).not.toContain('**')
  })

  it('hides heading and list markers', () => {
    const html = markdownToEditorHtml('# Title\n\n- one\n- two')
    expect(html).toContain('<h1>')
    expect(html).toContain('Title')
    expect(html).not.toContain('# Title')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
  })

  it('hides task checkboxes and wiki brackets', () => {
    const html = markdownToEditorHtml('- [ ] 待办\n\n[[相关笔记]]')
    expect(html).toContain('data-task=" "')
    expect(html).toContain('待办')
    expect(html).not.toContain('[ ]')
    expect(html).toContain('data-wiki="相关笔记"')
    expect(html).not.toContain('[[')
  })

  it('drops socratic machine fences', () => {
    const html = markdownToEditorHtml('正文\n```socratic-card\nconfirmed: A\n```')
    expect(html).toContain('正文')
    expect(html).not.toContain('socratic')
    expect(html).not.toContain('confirmed')
  })
})

describe('normalizeEditorMarkdown', () => {
  it('collapses excessive blank lines', () => {
    expect(normalizeEditorMarkdown('a\n\n\n\nb')).toBe('a\n\nb')
  })
})
