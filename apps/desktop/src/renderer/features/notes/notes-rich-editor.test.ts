import { describe, expect, it } from 'vitest'
import { markdownToEditorHtml, normalizeEditorMarkdown } from './notes-rich-editor'

describe('notes-rich-editor', () => {
  it('renders inline markdown as formatted html', () => {
    const html = markdownToEditorHtml('**The** <u>quoted</u>')
    expect(html).toContain('<strong>The</strong>')
    expect(html).toContain('<u>quoted</u>')
  })

  it('renders headings and lists', () => {
    const html = markdownToEditorHtml('# Title\n\n- one\n- two')
    expect(html).toContain('<h1>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
  })

  it('collapses excessive blank lines', () => {
    expect(normalizeEditorMarkdown('a\n\n\n\nb')).toBe('a\n\nb')
  })
})
