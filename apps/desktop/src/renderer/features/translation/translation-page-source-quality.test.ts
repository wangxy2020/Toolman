import { describe, expect, it } from 'vitest'
import {
  flattenLayoutHtmlTable,
  gfmTablesToHtml,
  hasGfmTableMarkup,
  hasVisibleParsePreviewBody,
  htmlPreviewToVisibleText,
  isLayoutGfmTable,
  isLayoutHtmlTable,
  isRichMarkdownPreview,
  isTranslationPageSourceInsufficient,
  chunkPipeCellsIntoRows,
  markSerialNumberTableColumns,
  mergeTrailingPipeRowsIntoHtmlTables,
  normalizeGfmTableMarkup,
  promoteOrphanPipeRowsToHtmlTables,
  repairDocumentPreviewTables,
  resolveDocumentPageDisplayText,
  resolveParsePreviewKind,
  sanitizeDocumentPreviewHtml,
  usesDocumentPageTableFit,
  usesRichDocumentPagePreview,
} from './translation-page-source-quality'
// isLayoutGfmTable exercised via usesRichDocumentPagePreview / resolveDocumentPageDisplayText

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

  it('flattens ODL layout tables instead of rendering a crushed rich grid', () => {
    const html = [
      '<table><tr>',
      '<td>SECTION</td><td></td><td></td><td></td><td></td><td></td>',
      '</tr><tr>',
      '<td>1.0</td><td></td><td>CONTRACT</td><td></td><td>AGREEMENT</td><td></td>',
      '</tr></table>',
    ].join('')
    expect(isLayoutHtmlTable(html)).toBe(true)
    expect(usesRichDocumentPagePreview(html)).toBe(false)
    expect(usesDocumentPageTableFit(html)).toBe(false)
    expect(isRichMarkdownPreview(html, html)).toBe(false)
    const plain = resolveDocumentPageDisplayText(html, false)
    expect(plain).toContain('SECTION')
    expect(plain).toContain('CONTRACT AGREEMENT')
    expect(plain).not.toContain('<table')
  })

  it('keeps prose above a data table on the rich parse path', () => {
    const prose =
      '<p>Claim for Vehicle Detention, Empty Trailer Movements and Related Additional Costs.</p>' +
      '<p>The Contractor hereby submits the following particulars:</p>'
    const table = [
      '<table><tr><th>Item</th><th>Description</th><th>Amount (USD)</th><th>Remark</th></tr>',
      '<tr><td>1</td><td>Detention at Bukoba</td><td>12,500.00</td><td>14 days</td></tr>',
      '<tr><td>2</td><td>Empty trailer return</td><td>3,200.00</td><td>Same route</td></tr>',
      '<tr><td>3</td><td>Additional handling</td><td>1,800.00</td><td></td></tr>',
      '</table>',
    ].join('')
    const html = `${prose}${table}`
    expect(isLayoutHtmlTable(html)).toBe(false)
    expect(usesRichDocumentPagePreview(html)).toBe(true)
    const plain = htmlPreviewToVisibleText(html)
    expect(plain).toContain('Vehicle Detention')
    expect(plain).toContain('Detention at Bukoba')
    expect(plain).toContain('Empty trailer return')
  })

  it('preserves prose outside layout tables when flattening', () => {
    const html = [
      '<p>Introduction paragraph before the grid.</p>',
      '<table><tr>',
      '<td>SECTION</td><td></td><td></td><td></td><td></td><td></td>',
      '</tr><tr>',
      '<td>1.0</td><td></td><td>CONTRACT</td><td></td><td>AGREEMENT</td><td></td>',
      '</tr></table>',
      '<p>Footer note after the grid.</p>',
    ].join('')
    const plain = flattenLayoutHtmlTable(html)
    expect(plain).toContain('Introduction paragraph')
    expect(plain).toContain('SECTION')
    expect(plain).toContain('CONTRACT')
    expect(plain).toContain('Footer note')
  })

  it('keeps real 3–4 column data tables on the rich path', () => {
    const html = [
      '<table><tr><th>Item</th><th>Description</th><th>Amount</th></tr>',
      '<tr><td>1</td><td>Time for Completion</td><td>730 days</td></tr>',
      '<tr><td>2</td><td>Defects Notification</td><td>365 days</td></tr>',
      '</table>',
    ].join('')
    expect(isLayoutHtmlTable(html)).toBe(false)
    expect(usesRichDocumentPagePreview(html)).toBe(true)
    expect(usesDocumentPageTableFit(html)).toBe(true)
  })

  it('flattens sparse cover-page GFM dumps instead of showing pipe noise', () => {
    const gfm = ['|1', 'EPC/TURNKEY', '| |--- |', 'FORM OF AGREEMENT'].join('\n')
    expect(usesRichDocumentPagePreview(gfm)).toBe(false)
    const plain = resolveDocumentPageDisplayText(gfm, false)
    expect(plain).toContain('EPC/TURNKEY')
    expect(plain).toContain('FORM OF AGREEMENT')
    expect(plain).not.toContain('|')
    expect(plain).not.toContain('---')
  })

  it('keeps real Contract Data GFM tables on the rich path', () => {
    const table = [
      '| Item | Sub-Clause | Entry |',
      '| --- | --- | --- |',
      "| Employer's name and address | 1.1.27 | Tembo Nickel |",
      '| Time for Completion | 1.1.84 | 730 days |',
    ].join('\n')
    expect(usesRichDocumentPagePreview(table)).toBe(true)
    expect(usesDocumentPageTableFit(table)).toBe(true)
  })

  it('normalizes compacted one-line ODL tables into HTML grids', () => {
    const jammed =
      "|Item|Sub-Clause|Entry| |---|---|---| |Employer's name and address|1.1.27 & 1.3 (d)|Tembo Nickel|"
    expect(hasGfmTableMarkup(jammed)).toBe(true)
    const normalized = normalizeGfmTableMarkup(jammed)
    expect(normalized.split('\n').length).toBeGreaterThanOrEqual(3)
    const html = gfmTablesToHtml(jammed)
    expect(html).toContain('<table')
    expect(html).toContain('<th>')
    expect(html).toContain('Employer')
    expect(html).not.toMatch(/\|---\|/)
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
    expect(sanitized).toContain('tm-translation-doc-table-wrap')
    expect(sanitized).toContain('tm-translation-doc-table')
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
    expect(sanitized).toContain('tm-translation-doc-table-wrap')
  })

  it('strips leftover ODL font sizing so parse HTML uses the page type', () => {
    const html = '<p style="font: 22pt Times; line-height: 1.1" size="5">Hello</p>'
    const sanitized = sanitizeDocumentPreviewHtml(html)
    expect(sanitized).not.toContain('22pt')
    expect(sanitized).not.toContain('size=')
    expect(sanitized).toContain('Hello')
  })

  it('merges trailing pipe rows into the preceding HTML table and marks S/N', () => {
    const html = [
      '<table><thead><tr><th>S/N</th><th>Issue</th><th>RECORD OF NEGOTIATIONS</th></tr></thead>',
      '<tbody>',
      '<tr><td>5</td><td>Tax Exemption</td><td>The Employer will obtain.</td></tr>',
      '<tr><td>7</td><td>Payment Terms</td><td>Payment will be made.</td></tr>',
      '</tbody></table>',
      '| |Work schedules (Contract Period)|It was confirmed that the Work Schedule will be agreed.|',
      '|9|Contractor Inputs|Contractor to avoid idle plant.|',
      '|10|Scope of the Work|It was that the scope of works was confirmed.|',
    ].join('\n')
    const sanitized = sanitizeDocumentPreviewHtml(html)
    expect(sanitized).toContain('tm-translation-doc-table--sn-first')
    expect(sanitized).toContain('Work schedules (Contract Period)')
    expect(sanitized).toContain('>9</td>')
    expect(sanitized).toContain('>10</td>')
    expect(sanitized).not.toMatch(/\|\s*9\s*\|/)
    expect(sanitized).not.toMatch(/\|\s*10\s*\|/)
  })

  it('merges jammed one-line continuation pipes (ODL mid-page dump)', () => {
    const html =
      '<table><thead><tr><th>S/N</th><th>Issue</th><th>RECORD</th></tr></thead><tbody>' +
      '<tr><td>7</td><td>Payment</td><td>Made.</td></tr></tbody></table>\n' +
      '| |Work schedules|It was confirmed.|9|Contractor Inputs|Avoid idle.|10|Scope of the Work|Confirmed.|'
    const sanitized = sanitizeDocumentPreviewHtml(html)
    expect(sanitized).toContain('Work schedules')
    expect(sanitized).toContain('>9</td>')
    expect(sanitized).toContain('>10</td>')
    expect(sanitized).toContain('Contractor Inputs')
    expect(sanitized).not.toContain('|9|')
  })
})

describe('mergeTrailingPipeRowsIntoHtmlTables', () => {
  it('appends continuation pipe rows after a closed HTML table', () => {
    const html =
      '<table><tr><th>S/N</th><th>Issue</th><th>Note</th></tr><tr><td>5</td><td>A</td><td>B</td></tr></table>\n|8|C|D|\n|9|E|F|'
    const merged = mergeTrailingPipeRowsIntoHtmlTables(html)
    expect(merged).toContain('<td>8</td>')
    expect(merged).toContain('<td>C</td>')
    expect(merged).toContain('<td>9</td>')
    expect(merged).not.toContain('|8|')
  })

  it('chunks jammed multi-row pipe soup by column count', () => {
    expect(chunkPipeCellsIntoRows(['', 'A', 'B', '9', 'C', 'D', '10', 'E', 'F'], 3)).toEqual([
      ['', 'A', 'B'],
      ['9', 'C', 'D'],
      ['10', 'E', 'F'],
    ])
  })
})

describe('markSerialNumberTableColumns', () => {
  it('marks S/N, SIN, Item (numeric body), and 序号 headers', () => {
    expect(markSerialNumberTableColumns('<table><tr><th>S/N</th><th>Issue</th></tr></table>')).toContain(
      'tm-translation-doc-table--sn-first',
    )
    expect(
      markSerialNumberTableColumns(
        '<table><tr><th>SIN</th><th>Issue</th></tr><tr><td>1</td><td>A</td></tr></table>',
      ),
    ).toContain('tm-translation-doc-table--sn-first')
    expect(
      markSerialNumberTableColumns(
        '<table><tr><th>Item</th><th>Issue</th></tr><tr><td>1</td><td>A</td></tr><tr><td>2</td><td>B</td></tr></table>',
      ),
    ).toContain('tm-translation-doc-table--sn-first')
    expect(markSerialNumberTableColumns('<table><tr><th>序号</th><th>事项</th></tr></table>')).toContain(
      'tm-translation-doc-table--sn-first',
    )
    // Contract Data "Item" with long labels must stay wide.
    expect(
      markSerialNumberTableColumns(
        "<table><tr><th>Item</th><th>Entry</th></tr><tr><td>Employer's name</td><td>Tembo</td></tr></table>",
      ),
    ).not.toContain('tm-translation-doc-table--sn-first')
  })
})

describe('repairDocumentPreviewTables', () => {
  it('promotes orphan pipe-only continuation pages into a table', () => {
    const text = ['|8|Work schedules|Confirmed.|', '|9|Contractor Inputs|Avoid idle.|'].join('\n')
    const repaired = repairDocumentPreviewTables(text)
    expect(repaired).toContain('<table')
    expect(repaired).toContain('<td>8</td>')
    expect(repaired).toContain('Work schedules')
    expect(repaired).not.toContain('|8|')
  })

  it('promotes pipe rows wrapped in paragraph tags', () => {
    const text = [
      '<p>|8|Cable Lot|Confirmed.|</p>',
      '<p>|9|Pipe Lot|Pending.|</p>',
    ].join('\n')
    const repaired = promoteOrphanPipeRowsToHtmlTables(text)
    expect(repaired).toContain('<table')
    expect(repaired).toContain('<td>8</td>')
    expect(repaired).toContain('Cable Lot')
  })

  it('does not treat empty-S/N data rows as the table header', () => {
    const text = ['||Cable Lot|Confirmed.|', '|9|Pipe Lot|Pending.|'].join('\n')
    const repaired = promoteOrphanPipeRowsToHtmlTables(text)
    expect(repaired).toContain('<th>S/N</th>')
    expect(repaired).toContain('<td>Cable Lot</td>')
    expect(repaired).not.toMatch(/<th>Cable Lot<\/th>/)
  })

  it('promotes jammed one-line orphan continuation pipes', () => {
    const text =
      '|8|Work schedules|Confirmed.|9|Contractor Inputs|Avoid idle.|10|Scope of the Work|Confirmed.|'
    const repaired = promoteOrphanPipeRowsToHtmlTables(text)
    expect(repaired).toContain('<table')
    expect(repaired).toContain('<td>8</td>')
    expect(repaired).toContain('<td>9</td>')
    expect(repaired).toContain('<td>10</td>')
  })

  it('keeps consistent short-cell schedule pipes as data tables', () => {
    const table = [
      '|1|1.1.1|Payment Terms|Yes|',
      '|2|1.1.2|Tax Exemption|Yes|',
      '|3|1.1.3|Work Schedule|No|',
    ].join('\n')
    expect(isLayoutGfmTable(table)).toBe(false)
    expect(repairDocumentPreviewTables(table)).toContain('<table')
  })

  it('does not wrap letter prose with incidental pipes into a table', () => {
    const letter = [
      'Dear Sirs,',
      'We refer to Clause 8.4 | Extension of Time and the events below.',
      '1. Background',
      'The Contractor mobilized to Bukoba and waited for access.',
      '2. Request',
      'Accordingly we request approval of the claim amount.',
    ].join('\n')
    expect(promoteOrphanPipeRowsToHtmlTables(letter)).not.toContain('<table')
    expect(repairDocumentPreviewTables(letter)).not.toContain('<table')
  })

  it('keeps pipe-wrapped letter paragraphs out of a claim GFM table body', () => {
    const raw = [
      '|Claim Item|Original Invoice Amount (TZS)|Basis of Claim|Amount Claimed (TZS)|',
      '|---|---|---|---|',
      '|In our letter No. 2026045 dated 17 July 2026, we requested TANESCO to complete payment.|',
      '|Vehicle Standby Charges|33,800,000.00|Daily rate for 7 days|21,509,090.91|',
      '|Total Claim Excluding VAT| | |122,259,090.91|',
    ].join('\n')
    const html = gfmTablesToHtml(raw)
    expect(html).toContain('<table')
    expect(html).toContain('In our letter No. 2026045')
    expect(html).not.toMatch(/<td[^>]*>[\s\S]*In our letter/i)
    expect(html).toContain('<td>Vehicle Standby Charges</td>')
  })

  it('keeps dense 6-col HTML schedules rich when cells are filled', () => {
    const html = [
      '<table><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr>',
      '<tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr>',
      '<tr><td>7</td><td>8</td><td>9</td><td>10</td><td>11</td><td>12</td></tr>',
      '</table>',
    ].join('')
    expect(isLayoutHtmlTable(html)).toBe(false)
  })
})
