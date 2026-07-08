import { describe, expect, it } from 'vitest'
import { sanitizeOdlPreviewContent, pickLongestUsableOdlBody, postProcessOdlPreviewContent, relocateOdlTableFooters, isLikelyPageFooterLine } from './odl-preview-text.js'

describe('sanitizeOdlPreviewContent', () => {
  it('collapses consecutive duplicate lines', () => {
    expect(sanitizeOdlPreviewContent(['a', 'a', 'b'].join('\n'))).toBe('a\nb')
  })

  it('collapses dominant repeated numeric noise on sparse pages', () => {
    const raw = [
      'Click Download to see negotiation minutes.',
      'SAR',
      ...Array.from({ length: 40 }, () => '27'),
    ].join('\n')
    expect(sanitizeOdlPreviewContent(raw)).toBe(
      'Click Download to see negotiation minutes.\nSAR\n27',
    )
  })

  it('strips page markers before sanitizing', () => {
    expect(sanitizeOdlPreviewContent('【第 1 页】\n\nCONTRACT FOR HEP')).toBe('CONTRACT FOR HEP')
  })

  it('picks the longest usable body across ODL sources', () => {
    expect(
      pickLongestUsableOdlBody('【第 1 页】', '【第 1 页】\n\n# CONTRACT FOR Hamlet Electrification Project'),
    ).toBe('# CONTRACT FOR Hamlet Electrification Project')
  })

  it('relocates page footer lines out of the last table row', () => {
    const html = [
      '<table>',
      '<tr><td>4.</td><td>Sub-contractor</td></tr>',
      '<tr><td>October, 2017 Version<br>Page 1</td><td></td></tr>',
      '</table>',
    ].join('')
    const out = relocateOdlTableFooters(html)
    expect(out).toContain('Sub-contractor')
    expect(out).toContain('October, 2017 Version')
    expect(out).toContain('Page 1')
    expect(out).not.toMatch(/<tr><td>October, 2017 Version/)
  })

  it('extracts footer lines merged into the last data cell', () => {
    const html = [
      '<table>',
      '<tr><td>4.<br>October, 2017 Version<br>Page 1</td><td>Sub-contractor</td></tr>',
      '</table>',
    ].join('')
    const out = relocateOdlTableFooters(html)
    expect(out).toContain('<td>4.</td>')
    expect(out).toContain('October, 2017 Version')
    expect(out).not.toContain('October, 2017 Version<br>Page 1</td><td>Sub-contractor')
  })

  it('recognizes footer lines', () => {
    expect(isLikelyPageFooterLine('Page 1')).toBe(true)
    expect(isLikelyPageFooterLine('October, 2017 Version')).toBe(true)
    expect(isLikelyPageFooterLine('27')).toBe(false)
  })

  it('post-processes html tables and numeric noise together', () => {
    const raw = [
      '<table><tr><td>4.<br>Page 1</td><td>Body</td></tr></table>',
      ...Array.from({ length: 12 }, () => '27'),
    ].join('\n')
    const out = postProcessOdlPreviewContent(raw)
    expect(out).toContain('Body')
    expect(out).toContain('Page 1')
    expect(out.match(/^27$/gm)?.length ?? 0).toBeLessThanOrEqual(1)
  })
})
