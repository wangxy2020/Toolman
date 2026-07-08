import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  normalizeMarkdownHtmlLineBreaksOutsideTables,
  renderMarkdownHtmlBreaks,
} from './markdown-html-breaks'

describe('normalizeMarkdownHtmlLineBreaksOutsideTables', () => {
  it('converts <br> to markdown hard breaks outside tables', () => {
    const input = '第一行<br>第二行'
    expect(normalizeMarkdownHtmlLineBreaksOutsideTables(input)).toBe('第一行  \n第二行')
  })

  it('keeps <br> inside markdown table rows', () => {
    const input = '| A | B |\n| --- | --- |\n| 上行<br>下行 | 继续 |'
    expect(normalizeMarkdownHtmlLineBreaksOutsideTables(input)).toBe(input)
  })
})

describe('renderMarkdownHtmlBreaks', () => {
  it('renders literal <br> tags as line breaks', () => {
    const html = renderToStaticMarkup(
      createElement('span', null, renderMarkdownHtmlBreaks('上行<br>下行')),
    )
    expect(html).toBe('<span>上行<br/>下行</span>')
  })
})
