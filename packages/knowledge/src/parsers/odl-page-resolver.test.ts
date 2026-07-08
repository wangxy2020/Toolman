import { describe, expect, it } from 'vitest'
import { buildMockOcrCollapsePageText } from './odl-anomaly-interceptor.js'
import {
  collapseRepeatedOdlHtmlNoise,
  pickBestSanitizedOdlBody,
  postProcessOdlPreviewContent,
} from './odl-preview-text.js'
import { pickBestInterceptedOdlBody, resolveOdlPageContent } from './odl-page-resolver.js'

describe('odl-page-resolver', () => {
  it('prefers sanitized body over longer raw spam (pickLongestRawBody regression)', () => {
    const noisyMarkdown = buildMockOcrCollapsePageText()
    const shortPlain = 'Click Download to see negotiation minutes.\nSAR'

    const best = pickBestSanitizedOdlBody(noisyMarkdown, shortPlain)
    expect(best.match(/^27$/gm)?.length ?? 0).toBeLessThanOrEqual(1)
    expect(best).toContain('Click Download')
    expect(best).toContain('SAR')
  })

  it('pickBestInterceptedOdlBody rejects consecutive duplicate collapse', () => {
    const noisy = buildMockOcrCollapsePageText()
    const result = pickBestInterceptedOdlBody(noisy)
    expect(result.detection.isAnomaly).toBe(true)
    expect(result.cleanedText).not.toMatch(/^27$/m)
    expect(result.cleanedText).toContain('SAR')
  })

  it('resolveOdlPageContent reads from markdown channel when pages array is empty', () => {
    const page8 = buildMockOcrCollapsePageText()
    const resolved = resolveOdlPageContent(8, {
      pages: [],
      plainText: '',
      markdown: `【第 8 页】\n\n${page8}`,
      totalPages: 48,
    })
    expect(resolved.text).not.toMatch(/^27$/m)
    expect(resolved.text).toContain('Click Download')
  })

  it('collapseRepeatedOdlHtmlNoise removes numeric-only table spam', () => {
    const html = [
      '<table>',
      ...Array.from({ length: 30 }, () => '<tr><td>27</td></tr>'),
      '</table>',
      '<p>Click Download to see negotiation minutes.</p>',
    ].join('')
    const out = postProcessOdlPreviewContent(html)
    expect(out).toContain('Click Download')
    expect(out.match(/>\s*27\s*</g)?.length ?? out.match(/^27$/gm)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it('collapseRepeatedOdlHtmlNoise drops pure numeric noise tables', () => {
    const html = `<table>${Array.from({ length: 20 }, () => '<tr><td>27</td></tr>').join('')}</table>`
    expect(collapseRepeatedOdlHtmlNoise(html)).toBe('')
  })
})
