import { describe, expect, it } from 'vitest'
import { buildTranslationDisplayBlocks } from './translation-display-blocks'
import { resolveParseDisplayContent } from './document-page-parse-display'
import { sanitizeParsePreviewContent } from './translation-page-source-quality'

const PROSE = [
  'We refer to the transport of the transformer to the Bukoba substation.',
  'The Contractor incurred detention costs while awaiting access to site.',
].join('\n')

const HEADERS = '|Claim Item|Original Invoice Amount (TZS)|Basis of Claim|Amount Claimed (TZS)|'

/** ODL jams the whole claim table on one line; a lone empty cell separates rows. */
const JAMMED_CLAIM_PAGE = [
  PROSE,
  '1. Breakdown of the Claim',
  `${HEADERS} |---|---|---|---| |Vehicle Detention|33,800,000.00|Based on 11 days of invoices|21,509,090.91| |Empty Trailer to Bukoba|36,400,000.00|Claimed in full|36,400,000.00| |Empty Demobilisation of Trailer|29,900,000.00|50% claimed|14,950,000.00| |Total Claim Excluding VAT| | |122,259,090.91|`,
  'Accordingly we request TANESCO to approve the claim.',
].join('\n')

function display(raw: string) {
  const { text, markdown } = sanitizeParsePreviewContent(raw, raw)
  return resolveParseDisplayContent(text, markdown, raw, raw)
}

/** Parse preview must layout like translate: blocks, not premature HTML tables. */
function expectParseLikeTranslate(displayMarkdown: string) {
  expect(displayMarkdown).not.toContain('<table')
  expect(displayMarkdown).not.toContain('<td')
  const blocks = buildTranslationDisplayBlocks(displayMarkdown)
  expect(blocks.some((block) => block.type === 'paragraph' || block.type === 'heading')).toBe(true)
  const table = blocks.find((block) => block.type === 'table')
  expect(table?.type === 'table' && table.headers.length >= 2 && table.rows.length >= 1).toBe(true)
  return { blocks, table }
}

describe('resolveParseDisplayContent — claim letter pages', () => {
  it('keeps prose, heading and claim grid for a jammed one-line pipe table (same as translate)', () => {
    const { displayMarkdown, displayPlain } = display(JAMMED_CLAIM_PAGE)
    expect(displayMarkdown).toContain('We refer to the transport of the transformer')
    expect(displayMarkdown).toContain('1. Breakdown of the Claim')
    expect(displayMarkdown).toContain('Accordingly we request TANESCO')
    const { table } = expectParseLikeTranslate(displayMarkdown)
    if (table?.type === 'table') {
      expect(table.headers[0]).toContain('Claim Item')
      expect(table.rows.some((row) => row[0]?.includes('Empty Trailer to Bukoba'))).toBe(true)
      expect(table.rows.some((row) => row[0]?.includes('Total Claim'))).toBe(true)
    }
    expect(displayPlain).toContain('Bukoba substation')
  })

  it('keeps prose around a separator-less multi-line pipe table', () => {
    const raw = [
      PROSE,
      '1. Breakdown of the Claim',
      HEADERS,
      '|Vehicle Detention|33,800,000.00|Based on 11 days|21,509,090.91|',
      '|Total Claim Excluding VAT| | |122,259,090.91|',
    ].join('\n')
    const { displayMarkdown } = display(raw)
    expect(displayMarkdown).toContain('We refer to the transport')
    expect(displayMarkdown).toContain('1. Breakdown of the Claim')
    expectParseLikeTranslate(displayMarkdown)
  })

  it('keeps every body row of a multi-line GFM table with an empty-cell row', () => {
    const raw = [
      PROSE,
      '| Claim Item | Original Invoice Amount (TZS) | Basis of Claim | Amount Claimed (TZS) |',
      '| --- | --- | --- | --- |',
      '|Vehicle Detention|33,800,000.00|Based on 11 days|21,509,090.91|',
      '|Empty Trailer to Bukoba|36,400,000.00|Claimed in full|36,400,000.00|',
      '|Total Claim Excluding VAT| | |122,259,090.91|',
    ].join('\n')
    const { displayMarkdown } = display(raw)
    expect(displayMarkdown).toContain('We refer to the transport')
    const { table } = expectParseLikeTranslate(displayMarkdown)
    if (table?.type === 'table') {
      expect(table.rows).toHaveLength(3)
    }
  })

  it('keeps letter paragraphs outside the claim table for block layout', () => {
    const raw = [
      'Dear Sirs,',
      'We refer to the Contract.',
      '',
      '|Claim Item|Original Invoice Amount (TZS)|Basis of Claim|Amount Claimed (TZS)|',
      '|---|---|---|---|',
      '|In our letter No. 2026045 dated 17 July 2026, we requested TANESCO to complete payment or obtain exemption by 18 July 2026.|',
      '|Through letters No. 2026047 and No. 2026048, we further notified TANESCO of the continuing vehicle detention.|',
      '|Vehicle Standby Charges|33,800,000.00|Daily rate for 7 days|21,509,090.91|',
      '|Total Claim Excluding VAT| | |122,259,090.91|',
    ].join('\n')
    const { displayMarkdown } = display(raw)
    const { blocks, table } = expectParseLikeTranslate(displayMarkdown)
    expect(blocks.some((block) => block.type !== 'table' && 'text' in block && block.text.includes('In our letter'))).toBe(
      true,
    )
    if (table?.type === 'table') {
      expect(table.rows.every((row) => !/In our letter|Through letters/i.test(row[0] ?? ''))).toBe(true)
      expect(table.rows.some((row) => row[0]?.includes('Vehicle Standby'))).toBe(true)
    }
  })

  it('keeps a real ODL claim page: flattens 1-col letterhead, preserves 4-col pipes for blocks', () => {
    const raw = [
      '|No.189, Beijing South Road, Changji City, Xinjiang, China<br><br>Mobile: +255 758 599 766|',
      '|---|',
      '',
      'Email: lanbei1002@163.com',
      '',
      'In our letter No. 2026045 dated 17 July 2026, we requested TANESCO to complete payment.',
      '',
      '# 1. Breakdown of the Claim',
      '',
      'All amounts below are in Tanzanian shillings (TZS) and exclude VAT.',
      '',
      '|Claim Item|Original Invoice<br>Amount (TZS)|Basis of Claim|Amount Claimed<br>(TZS)|',
      '|---|---|---|---|',
      '|Vehicle Standby Charges<br>(Standing Time)|33,800,000.00|Daily rate derived from the<br>invoiced total for 11 days.|21,509,090.91|',
      '|Empty Demobilisation of Trailer|36,400,000.00|Claimed in full.|36,400,000.00|',
      '|Total Claim Excluding VAT| | |122,259,090.91|',
    ].join('\n')
    const { displayMarkdown } = display(raw)
    expect(displayMarkdown).toContain('No.189, Beijing South Road')
    expect(displayMarkdown).toContain('1. Breakdown of the Claim')
    // Letterhead must not leak as a 1-col GFM stub.
    expect(displayMarkdown).not.toMatch(/\|No\.189/)
    expect(displayMarkdown.split('|Claim Item')[0]).not.toContain('|---')
    const { table } = expectParseLikeTranslate(displayMarkdown)
    if (table?.type === 'table') {
      expect(table.headers[0]).toContain('Claim Item')
      expect(table.rows.some((row) => /Vehicle Standby/i.test(row[0] ?? ''))).toBe(true)
      expect(table.rows.some((row) => /Total Claim/i.test(row[0] ?? ''))).toBe(true)
    }
  })

  it('keeps an HTML claim table intact when re-sanitizing a cached preview', () => {
    const html =
      `<p>${PROSE.split('\n')[0]}</p><h2>1. Breakdown of the Claim</h2>` +
      '<table><tr><th>Claim Item</th><th>Original Invoice Amount (TZS)</th><th>Basis of Claim</th><th>Amount Claimed (TZS)</th></tr>' +
      '<tr><td>Vehicle Detention</td><td>33,800,000.00</td><td>Based on 11 days</td><td>21,509,090.91</td></tr>' +
      '<tr><td>Total Claim Excluding VAT</td><td></td><td></td><td>122,259,090.91</td></tr></table>'
    const sanitized = sanitizeParsePreviewContent(html, html)
    expect(sanitized.markdown).toContain('<table')
    const { displayMarkdown } = resolveParseDisplayContent(sanitized.text, sanitized.markdown, html, html)
    expect(displayMarkdown).toContain('Bukoba')
    expect(displayMarkdown).toContain('1. Breakdown of the Claim')
    expect(displayMarkdown.match(/<th>/g)).toHaveLength(4)
  })
})
