import { describe, expect, it } from 'vitest'
import { getPageRemark, normalizePageRemarks, setPageRemark, resolveSavedPageRemarks } from './document-page-remarks'

describe('document-page-remarks', () => {
  it('keeps only valid page remarks', () => {
    expect(
      normalizePageRemarks({
        '1': 'check clause',
        '0': 'nope',
        '2': '  ',
        foo: 'bar',
        '3': 12,
      }),
    ).toEqual({ '1': 'check clause' })
    expect(normalizePageRemarks(null)).toBeUndefined()
  })

  it('reads and writes a page remark without dropping others', () => {
    const first = setPageRemark(undefined, 4, 'need stamp')
    expect(getPageRemark(first, 4)).toBe('need stamp')
    const second = setPageRemark(first, 5, 'ask legal')
    expect(second).toEqual({ '4': 'need stamp', '5': 'ask legal' })
    expect(setPageRemark(second, 4, '  ')).toEqual({ '5': 'ask legal' })
  })

  it('merges a pending remark into the saved map for the same page only', () => {
    const saved = setPageRemark(undefined, 2, 'page two')
    expect(resolveSavedPageRemarks(saved, { pageNumber: 8, text: 'page eight' })).toEqual({
      '2': 'page two',
      '8': 'page eight',
    })
    expect(resolveSavedPageRemarks(saved, { pageNumber: 2, text: 'updated two' })).toEqual({
      '2': 'updated two',
    })
    expect(resolveSavedPageRemarks(saved, null)).toEqual({ '2': 'page two' })
  })
})
