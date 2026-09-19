import { describe, expect, it } from 'vitest'
import {
  createDocumentPageBodyLookup,
  resolvePageForDisplay,
  snapshotToPageBody,
  toDocumentPageBody,
} from './document-page-bodies'
import type { DocumentPageState } from './document-page-types'

describe('document-page-bodies', () => {
  it('keeps ODL HTML on the rich path without stripping it to plain first', () => {
    const html = '<table><tr><td>Time for Completion</td><td>The parties agreed.</td></tr></table>'
    const body = toDocumentPageBody(html, html)
    expect(body?.kind).toBe('html')
    expect(body?.plain).toBe('')
    expect(body?.markdown).toContain('<table>')
  })

  it('reads saved fit settings from Markdown without treating the comment as HTML', () => {
    const markdown = [
      '<!-- tm-doc-fit fontSize="11" lineHeight="1.4" padding="10" scale="0.85" boxWidth="520" boxHeight="734" -->',
      '',
      '# Title',
    ].join('\n')
    const body = toDocumentPageBody('# Title', markdown)
    expect(body?.kind).toBe('markdown')
    expect(body?.markdown).toBe('# Title')
    expect(body?.fit?.fontSize).toBe(11)
    expect(body?.fit?.boxWidth).toBe(520)
  })

  it('builds a map from snapshots without requiring live page bodies', () => {
    const pages: DocumentPageState[] = [
      { pageNumber: 1, sourceText: '', translatedText: '', status: 'parsed' },
      { pageNumber: 2, sourceText: '', translatedText: '', status: 'parsed' },
    ]
    const lookup = createDocumentPageBodyLookup(
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: '# Parsed',
          parsedMarkdown: '# Parsed',
          status: 'parsed',
        },
      ],
      pages,
    )

    expect(lookup.get(1)?.plain).toBe('# Parsed')
    expect(lookup.get(2)).toBeUndefined()
  })

  it('lets live page text replace a saved snapshot body', () => {
    const lookup = createDocumentPageBodyLookup(
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: '# Saved',
          parsedMarkdown: '# Saved',
          status: 'parsed',
        },
      ],
      [{ pageNumber: 1, sourceText: '', translatedText: '# Live', parsedMarkdown: '# Live', status: 'parsed' }],
    )

    expect(lookup.get(1)?.plain).toBe('# Live')
  })

  it('attaches a body only when the row is allowed to show text', () => {
    const lightweight: DocumentPageState = {
      pageNumber: 1,
      sourceText: '',
      translatedText: '',
      status: 'parsed',
    }
    const body = snapshotToPageBody({
      pageNumber: 1,
      sourceText: 'src',
      translatedText: '# Parsed',
      parsedMarkdown: '# Parsed',
      status: 'parsed',
    })

    expect(resolvePageForDisplay(lightweight, body, false).translatedText).toBe('')
    expect(resolvePageForDisplay(lightweight, body, true).translatedText).toBe('# Parsed')
    expect(
      resolvePageForDisplay(
        { ...lightweight, translatedText: '# Live', parsedMarkdown: '# Live' },
        body,
        false,
      ).translatedText,
    ).toBe('')
  })

  it('keeps the translation when a leftover parse body is HTML or markdown', () => {
    const translated: DocumentPageState = {
      pageNumber: 1,
      sourceText: 'Dear Sir',
      translatedText: '尊敬的先生：\n我们已圆满完成工程。',
      parsedMarkdown: '<p>Dear Sir</p>',
      status: 'done',
    }
    const body = toDocumentPageBody(translated.translatedText, translated.parsedMarkdown)
    const display = resolvePageForDisplay(translated, body, true)
    expect(display.translatedText).toBe(translated.translatedText)
    expect(display.parsedMarkdown).toBeUndefined()
  })
})
