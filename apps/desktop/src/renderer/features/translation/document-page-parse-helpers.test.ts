import { describe, expect, it, vi } from 'vitest'

import {
  resolveTranslationSourceText,
  toPlainTranslationSource,
  yieldToNextPaint,
} from './document-page-parse-helpers'

describe('resolveTranslationSourceText', () => {
  it('flattens ODL layout HTML into plain prose for the model', () => {
    const html = [
      '<table><tr>',
      '<td>EPC/TURNKEY</td><td></td><td></td><td></td><td></td><td></td>',
      '</tr><tr>',
      '<td>FORM</td><td></td><td>OF</td><td></td><td>AGREEMENT</td><td></td>',
      '</tr></table>',
    ].join('')
    const source = resolveTranslationSourceText('', html)
    expect(source).not.toContain('<table')
    expect(source).toContain('EPC/TURNKEY')
    expect(source).toMatch(/FORM.*AGREEMENT/s)
    expect(toPlainTranslationSource(html)).not.toContain('<')
  })

  it('keeps real HTML data tables for structure-preserving translate', () => {
    const html =
      '<table><tr><th>Item</th><th>Amount</th></tr><tr><td>Fee</td><td>100</td></tr></table>'
    const source = resolveTranslationSourceText('', html)
    expect(source).toContain('<table')
    expect(source).toContain('Fee')
    expect(toPlainTranslationSource(html)).toContain('<table')
  })
})


describe('yieldToNextPaint', () => {
  it('resolves on the next timer after animation frame', async () => {
    vi.useFakeTimers()
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', raf)

    const pending = yieldToNextPaint()
    await vi.runAllTimersAsync()
    await pending

    expect(raf).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
