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

  it('renders task checkboxes instead of raw markdown markers', () => {
    const html = markdownToEditorHtml('- [ ] buy milk\n- [x] done')
    expect(html).toContain('data-task-list="true"')
    expect(html).toContain('tm-notes-task-check')
    expect(html).toContain('role="checkbox"')
    expect(html).toContain('data-checked="false"')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('buy milk')
    expect(html).not.toContain('- [ ]')
    expect(html).not.toContain('<input')
  })

  it('renders markdown tables as html tables', () => {
    const html = markdownToEditorHtml('| 列 1 | 列 2 |\n| --- | --- |\n| a | b |')
    expect(html).toContain('<table class="tm-notes-rich-table">')
    expect(html).toContain('<th>列 1</th>')
    expect(html).toContain('<td>a</td>')
    expect(html).not.toContain('| --- |')
  })

  it('renders markdown images as img tags with file path metadata', () => {
    const html = markdownToEditorHtml('![shot.png](file:///tmp/shot.png)')
    expect(html).toContain('<img class="tm-notes-rich-image"')
    expect(html).toContain('alt="shot.png"')
    expect(html).toContain('data-file-path="/tmp/shot.png"')
    expect(html).not.toContain('![shot.png]')
  })

  it('treats empty checkbox markers as task lines', () => {
    const html = markdownToEditorHtml('- [ ]')
    expect(html).toContain('tm-notes-task-check')
    expect(html).not.toContain('<li>[ ]</li>')
  })

  it('renders task and table together from markdown', () => {
    const source = [
      '- [ ] 待办',
      '',
      '| 列 1 | 列 2 | 列 3 |',
      '| --- | --- | --- |',
      '| 内容 | 内容 | 内容 |',
    ].join('\n')
    const html = markdownToEditorHtml(source)
    expect(html).toContain('tm-notes-task-check')
    expect(html).toContain('tm-notes-rich-table')
    expect(html).toContain('<th>列 1</th>')
    expect(html).toContain('待办')
  })

  it('keeps ordered list markers when a line is also a task', () => {
    const html = markdownToEditorHtml('1. 普通\n2. [ ] 待办\n3. [x] 完成')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>普通</li>')
    expect(html).toContain('tm-notes-task-item')
    expect(html).toContain('data-checked="false"')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('待办')
    expect(html).toContain('完成')
    expect(html).not.toContain('data-task-list="true"')
  })

  it('keeps bullets when mixing plain and task unordered items', () => {
    const html = markdownToEditorHtml('- 普通\n- [ ] 待办')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>普通</li>')
    expect(html).toContain('tm-notes-task-item')
    expect(html).not.toContain('data-task-list="true"')
  })

  it('collapses excessive blank lines', () => {
    expect(normalizeEditorMarkdown('a\n\n\n\nb')).toBe('a\n\nb')
  })
})
