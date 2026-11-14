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

  it('does not resurrect snapshot bodies onto idle shells after 清空', () => {
    const lookup = createDocumentPageBodyLookup(
      [
        {
          pageNumber: 1,
          sourceText: 'src',
          translatedText: 'Claim Item flattened prose',
          parsedMarkdown: 'Claim Item flattened prose',
          status: 'parsed',
        },
      ],
      [{ pageNumber: 1, sourceText: '', translatedText: '', parsedMarkdown: '', status: 'idle' }],
    )

    expect(lookup.get(1)).toBeUndefined()
  })

  it('keeps live text when attach is off and fills lightweight shells from the body', () => {
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
    ).toBe('# Live')
  })

  it('fills empty translating shells from the snapshot body but not done shells', () => {
    const body = snapshotToPageBody({
      pageNumber: 1,
      sourceText: 'src',
      translatedText: '已翻译',
      parsedMarkdown: '<p>parsed</p>',
      status: 'parsed',
    })
    const translating = resolvePageForDisplay(
      { pageNumber: 1, sourceText: '', translatedText: '', status: 'translating' },
      body,
      true,
    )
    expect(translating.translatedText.length).toBeGreaterThan(0)
    expect(translating.status).toBe('translating')

    const doneEmpty = resolvePageForDisplay(
      { pageNumber: 1, sourceText: '', translatedText: '', status: 'done' },
      body,
      true,
    )
    expect(doneEmpty.translatedText).toBe('')

    const doneChinese = resolvePageForDisplay(
      { pageNumber: 1, sourceText: '', translatedText: '中文译文', parsedMarkdown: '<p>parsed</p>', status: 'done' },
      body,
      true,
    )
    expect(doneChinese.translatedText).toBe('中文译文')
    expect(doneChinese.parsedMarkdown).toBe('<p>parsed</p>')
  })

  it('keeps both translation and parse markdown so modes can switch', () => {
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
    expect(display.parsedMarkdown).toBe('<p>Dear Sir</p>')
  })

  it('does not wipe live text with an empty HTML body while translating', () => {
    const translating: DocumentPageState = {
      pageNumber: 1,
      sourceText: 'EPC FORM OF AGREEMENT',
      translatedText: 'EPC FORM OF AGREEMENT',
      parsedMarkdown: '<table><tr><td>EPC</td></tr></table>',
      status: 'translating',
    }
    const body = toDocumentPageBody(translating.translatedText, translating.parsedMarkdown)
    expect(body?.plain).toBe('')
    const display = resolvePageForDisplay(translating, body, true)
    expect(display.translatedText).toBe('EPC FORM OF AGREEMENT')
    expect(display.status).toBe('translating')
  })
})
