import { describe, expect, it } from 'vitest'
import {
  hasGfmTableMarkup,
  hasVisibleParsePreviewBody,
  htmlPreviewToVisibleText,
  isRichMarkdownPreview,
  isTranslationPageSourceInsufficient,
  resolveParsePreviewKind,
  sanitizeDocumentPreviewHtml,
} from './translation-page-source-quality'

describe('isTranslationPageSourceInsufficient', () => {
  it('rejects empty text', () => {
    expect(isTranslationPageSourceInsufficient('')).toBe(true)
  })

  it('accepts a short but valid header sentence', () => {
    expect(isTranslationPageSourceInsufficient('Click Download to see negotiation minutes.')).toBe(
      false,
    )
  })

  it('accepts normal contract text', () => {
    expect(
      isTranslationPageSourceInsufficient(
        'Click Download to see negotiation minutes. The Employer and Contractor agreed that all powers of attorney submitted with the bid remain valid for the purposes of this contract and subsequent negotiations between the parties.',
      ),
    ).toBe(false)
  })

  it('rejects repeated numeric OCR noise', () => {
    expect(
      isTranslationPageSourceInsufficient(
        Array.from({ length: 20 }, () => '27').join('\n'),
      ),
    ).toBe(true)
  })

  it('rejects mostly digits with almost no letters', () => {
    expect(isTranslationPageSourceInsufficient('27 8 27 27 27 27 27 27')).toBe(true)
  })
})

describe('isRichMarkdownPreview', () => {
  it('treats GFM pipe tables as rich markdown', () => {
    const table = [
      '| S/N | Issue | RECORD OF NEGOTIATIONS |',
      '| --- | --- | --- |',
      '| 5 | Time for Completion | The parties agreed. |',
    ].join('\n')
    expect(hasGfmTableMarkup(table)).toBe(true)
    expect(isRichMarkdownPreview(table, table)).toBe(true)
  })

  it('does not treat plain prose as a table', () => {
    expect(hasGfmTableMarkup('The parties agreed on the completion date.')).toBe(false)
    expect(isRichMarkdownPreview('The parties agreed on the completion date.')).toBe(false)
  })

  it('treats ODL HTML as rich markdown and keeps table text when stripped', () => {
    const html = '<table><tr><td>Time for Completion</td><td>The parties agreed.</td></tr></table>'
    expect(isRichMarkdownPreview(html, html)).toBe(true)
    expect(resolveParsePreviewKind(html, html)).toBe('html')
    expect(htmlPreviewToVisibleText(html)).toContain('Time for Completion')
    expect(htmlPreviewToVisibleText(html)).toContain('The parties agreed.')
  })
})

describe('hasVisibleParsePreviewBody', () => {
  it('accepts HTML without running the OCR collapse strip', () => {
    expect(hasVisibleParsePreviewBody('', '<table><tr><td>OK</td></tr></table>')).toBe(true)
    expect(hasVisibleParsePreviewBody('【第 1 页】', '')).toBe(false)
  })
})

describe('sanitizeDocumentPreviewHtml', () => {
  it('removes scripts and inline handlers from saved preview HTML', () => {
    const html = '<table onclick="alert(1)"><tr><td>OK</td></tr></table><script>alert(1)</script>'
    const sanitized = sanitizeDocumentPreviewHtml(html)
    expect(sanitized).toContain('<table')
    expect(sanitized).toContain('OK')
    expect(sanitized).not.toContain('script')
    expect(sanitized).not.toContain('onclick')
  })

  it('strips table width and font-size hints that crush or inflate columns', () => {
    const html =
      '<table width="900"><tr><td width="220" style="font-size:18pt;width:220px">22.</td><td>Body</td></tr></table>'
    const sanitized = sanitizeDocumentPreviewHtml(html)
    expect(sanitized).not.toContain('width=')
    expect(sanitized).not.toContain('font-size')
    expect(sanitized).toContain('22.')
    expect(sanitized).toContain('Body')
  })
})
