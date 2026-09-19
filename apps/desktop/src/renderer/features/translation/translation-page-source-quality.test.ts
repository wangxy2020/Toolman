import { describe, expect, it } from 'vitest'
import {
  hasGfmTableMarkup,
  hasVisibleParsePreviewBody,
  htmlPreviewToVisibleText,
  isRichMarkdownPreview,
  isTranslationPageSourceInsufficient,
  resolveDocumentPageDisplayText,
  resolveParsePreviewKind,
  sanitizeDocumentPreviewHtml,
  usesDocumentPageTableFit,
  usesRichDocumentPagePreview,
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

  it('keeps a letter with numbered headings as plain so list spacing does not apply', () => {
    const letter = [
      'TBEA',
      'No. 23, Chang\'an Road',
      '8th Sept 2026',
      '',
      '1. Application for Taking-Over Certificate of 400 kV Transmission Line',
      'We have successfully completed the works.',
      '2. Taking Over of 400 kV Transmission Line',
    ].join('\n')
    expect(resolveParsePreviewKind(letter)).toBe('plain')
  })

  it('does not treat a numbered letter outline as a markdown list', () => {
    expect(resolveParsePreviewKind('1. First\n2. Second\n3. Third')).toBe('plain')
  })

  it('treats a letter HTML parse as the same plain layout as the translation', () => {
    const html = '<p style="font-size:22pt">TBEA</p><p>Dear Sir,</p>'
    expect(usesRichDocumentPagePreview(html)).toBe(false)
    expect(resolveDocumentPageDisplayText(html, false)).toContain('TBEA')
    expect(resolveDocumentPageDisplayText(html, false)).toContain('Dear Sir,')
  })

  it('keeps HTML tables on the rich path', () => {
    const html = '<table><tr><td>Time for Completion</td><td>The parties agreed.</td></tr></table>'
    expect(usesRichDocumentPagePreview(html)).toBe(true)
    expect(usesDocumentPageTableFit(html)).toBe(true)
    expect(isRichMarkdownPreview(html, html)).toBe(true)
    expect(htmlPreviewToVisibleText(html)).toContain('Time for Completion')
  })

  it('does not use the table 字号 cap for letter HTML', () => {
    expect(usesDocumentPageTableFit('<p>Dear Sir,</p>')).toBe(false)
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
    expect(sanitized).not.toContain('22pt')
    expect(sanitized).toContain('22.')
    expect(sanitized).toContain('Body')
  })

  it('strips leftover ODL font sizing so parse HTML uses the page type', () => {
    const html = '<p style="font: 22pt Times; line-height: 1.1" size="5">Hello</p>'
    const sanitized = sanitizeDocumentPreviewHtml(html)
    expect(sanitized).not.toContain('22pt')
    expect(sanitized).not.toContain('size=')
    expect(sanitized).toContain('Hello')
  })
})
