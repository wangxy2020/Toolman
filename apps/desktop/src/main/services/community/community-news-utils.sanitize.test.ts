import { describe, expect, it } from 'vitest'

import { sanitizeNewsArticleHtml } from './community-news-utils.sanitize'

describe('sanitizeNewsArticleHtml', () => {
  it('removes script tags', () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    expect(sanitizeNewsArticleHtml(html)).toBe('<p>Hello</p><p>World</p>')
  })

  it('strips on* event handler attributes', () => {
    const html = '<img src="https://example.com/a.png" onerror="alert(1)" onclick="steal()" />'
    const sanitized = sanitizeNewsArticleHtml(html)
    expect(sanitized).not.toMatch(/\bon\w+\s*=/i)
    expect(sanitized).toContain('src="https://example.com/a.png"')
  })

  it('blocks javascript: URLs in href and src attributes', () => {
    const html = '<a href="javascript:alert(1)">Click</a><img src="javascript:alert(2)" />'
    const sanitized = sanitizeNewsArticleHtml(html)
    expect(sanitized).not.toMatch(/javascript:/i)
    expect(sanitized).toContain('<a href="#">Click</a>')
  })

  it('removes iframe, object, and embed tags', () => {
    const html =
      '<p>Safe</p><iframe src="https://evil.test"></iframe><object data="x"></object><embed src="y" />'
    expect(sanitizeNewsArticleHtml(html)).toBe('<p>Safe</p>')
  })

  it('unwraps body content and resolves relative links with baseUrl', () => {
    const html = '<html><body><p>Text</p><a href="/docs">Docs</a></body></html>'
    expect(sanitizeNewsArticleHtml(html, 'https://news.example.com/article')).toBe(
      '<p>Text</p><a href="https://news.example.com/docs">Docs</a>',
    )
  })
})
