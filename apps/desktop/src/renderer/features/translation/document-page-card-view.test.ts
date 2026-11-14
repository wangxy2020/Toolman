import { describe, expect, it } from 'vitest'
import {
  resolveDocumentPageCardMode,
  resolveDocumentPageCardView,
} from './document-page-card-view'
import type { DocumentPageState } from './document-page-types'

describe('document-page-card-view', () => {
  it('prefers translate mode when both armed flags are set', () => {
    expect(resolveDocumentPageCardMode(true, true)).toBe('translate')
    expect(resolveDocumentPageCardMode(true, false)).toBe('parse')
    expect(resolveDocumentPageCardMode(false, true)).toBe('translate')
  })

  it('shows Chinese when translate mode and page is done', () => {
    const page: DocumentPageState = {
      pageNumber: 1,
      sourceText: 'Hello',
      translatedText: '你好',
      parsedMarkdown: '<p>Hello</p>',
      status: 'done',
    }
    const view = resolveDocumentPageCardView(page, 'translate', true)
    expect(view.isTranslated).toBe(true)
    expect(view.displayText).toBe('你好')
    expect(view.showRich).toBe(false)
  })

  it('shows parse preview while translating until Chinese arrives', () => {
    const page: DocumentPageState = {
      pageNumber: 1,
      sourceText: 'Hello',
      translatedText: '',
      parsedMarkdown: '<p>Hello</p>',
      status: 'translating',
    }
    const view = resolveDocumentPageCardView(page, 'translate', true)
    expect(view.isTranslated).toBe(false)
    expect(view.isTranslating).toBe(true)
    expect(view.displayText).toContain('Hello')
  })

  it('shows parse markdown in parse mode even when Chinese exists', () => {
    const page: DocumentPageState = {
      pageNumber: 1,
      sourceText: 'Hello',
      translatedText: '你好',
      parsedMarkdown: '<p>Hello</p>',
      status: 'done',
    }
    const view = resolveDocumentPageCardView(page, 'parse', true)
    expect(view.isTranslated).toBe(false)
    expect(view.displayText).toContain('Hello')
  })

  it('keeps claim pipe tables on the shared block layout path (not rich HTML)', () => {
    const page: DocumentPageState = {
      pageNumber: 2,
      sourceText: 'Claim',
      translatedText: '',
      parsedMarkdown: [
        'We refer to the transport.',
        '1. Breakdown of the Claim',
        '|Claim Item|Original Invoice Amount (TZS)|Basis of Claim|Amount Claimed (TZS)|',
        '|Vehicle Detention|33,800,000.00|Based on 11 days|21,509,090.91|',
        '|Total Claim Excluding VAT| | |122,259,090.91|',
      ].join('\n'),
      status: 'parsed',
    }
    const view = resolveDocumentPageCardView(page, 'parse', true)
    expect(view.showRich).toBe(false)
    expect(view.fitTable).toBe(true)
    expect(view.displayText).toContain('Claim Item')
    expect(view.displayText).toContain('Vehicle Detention')
    expect(view.displayText).toContain('|')

    const light = resolveDocumentPageCardView(page, 'parse', false)
    expect(light.showRich).toBe(false)
    expect(light.displayText).toContain('Claim Item')
  })

  it('keeps HTML claim tables rich even before heavy attach', () => {
    const page: DocumentPageState = {
      pageNumber: 2,
      sourceText: 'Claim',
      translatedText: '',
      parsedMarkdown:
        '<p>We refer to the transport.</p><table><tr><th>Claim Item</th><th>Amount</th></tr><tr><td>Vehicle</td><td>1</td></tr></table>',
      status: 'parsed',
    }
    const light = resolveDocumentPageCardView(page, 'parse', false)
    // Without heavy attach, HTML still flags as table content for Markdown path when rich.
    expect(light.displayText).toContain('<table')
    expect(light.displayText).toContain('We refer')
  })

  it('does not wrap ordinary letter prose into a table', () => {
    const page: DocumentPageState = {
      pageNumber: 1,
      sourceText: 'Letter',
      translatedText: '',
      parsedMarkdown: [
        'Dear Sirs,',
        'We refer to the Contract and the delay in access to site.',
        '1. Background',
        'The Contractor mobilized equipment to Bukoba on 12 January.',
        '2. Request',
        'Accordingly we request your approval of the claim.',
      ].join('\n'),
      status: 'parsed',
    }
    const view = resolveDocumentPageCardView(page, 'parse', true)
    expect(view.displayText).not.toContain('<table')
    expect(view.fitTable).toBe(false)
  })
})
