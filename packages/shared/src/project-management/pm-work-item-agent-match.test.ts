import { describe, expect, it } from 'vitest'

import {
  estimatePmAssignmentQuantityFromDuration,
  findPmWorkItemForAgentSuggestion,
  matchPmCatalogNamesInTitle,
  readPmWorkItemAgentCode,
  type PmAgentWorkItemMatchable,
} from './pm-work-item-agent-match.js'

const items: PmAgentWorkItemMatchable[] = [
  { id: 'a', title: '钢筋绑扎', metadata: { code: 'WBS-01' } },
  { id: 'b', title: '混凝土浇筑', metadata: { wbsCode: 'wbs-02' } },
  { id: 'c', title: '模板安装', metadata: null },
]

describe('readPmWorkItemAgentCode', () => {
  it('reads code, wbsCode, or taskCode', () => {
    expect(readPmWorkItemAgentCode({ code: 'X-1' })).toBe('X-1')
    expect(readPmWorkItemAgentCode({ wbsCode: 'X-2' })).toBe('X-2')
    expect(readPmWorkItemAgentCode({ taskCode: 'X-3' })).toBe('X-3')
    expect(readPmWorkItemAgentCode(null)).toBeNull()
    expect(readPmWorkItemAgentCode({})).toBeNull()
  })
})

describe('findPmWorkItemForAgentSuggestion', () => {
  it('matches by workItemId first', () => {
    const match = findPmWorkItemForAgentSuggestion(items, {
      workItemId: 'b',
      workItemTitle: '钢筋绑扎',
    })
    expect(match?.id).toBe('b')
  })

  it('matches by workItemCode against metadata code/wbsCode (case-insensitive)', () => {
    const match = findPmWorkItemForAgentSuggestion(items, { workItemCode: 'WBS-02' })
    expect(match?.id).toBe('b')
  })

  it('falls back to workItemTitle exact match', () => {
    const match = findPmWorkItemForAgentSuggestion(items, { workItemTitle: '模板安装' })
    expect(match?.id).toBe('c')
  })

  it('returns undefined when nothing matches', () => {
    const match = findPmWorkItemForAgentSuggestion(items, { workItemTitle: '不存在的任务' })
    expect(match).toBeUndefined()
  })
})

describe('matchPmCatalogNamesInTitle', () => {
  it('matches catalog names that appear as substrings of the title', () => {
    const matched = matchPmCatalogNamesInTitle('钢筋绑扎与模板安装', ['钢筋', '模板', '油漆'])
    expect(matched).toEqual(['钢筋', '模板'])
  })

  it('prefers longer names and drops shorter names contained in a longer match', () => {
    const matched = matchPmCatalogNamesInTitle('钢筋工程施工', ['钢', '钢筋', '钢筋工程'])
    expect(matched).toEqual(['钢筋工程'])
  })

  it('returns an empty array when the title or names are empty', () => {
    expect(matchPmCatalogNamesInTitle('', ['钢筋'])).toEqual([])
    expect(matchPmCatalogNamesInTitle('钢筋绑扎', [])).toEqual([])
    expect(matchPmCatalogNamesInTitle('钢筋绑扎', ['油漆'])).toEqual([])
  })

  it('ignores duplicate and blank catalog names', () => {
    const matched = matchPmCatalogNamesInTitle('钢筋绑扎', ['钢筋', '钢筋', '  '])
    expect(matched).toEqual(['钢筋'])
  })
})

describe('estimatePmAssignmentQuantityFromDuration', () => {
  it('returns 1 when start or due date is missing', () => {
    expect(estimatePmAssignmentQuantityFromDuration(null, null)).toBe(1)
    expect(estimatePmAssignmentQuantityFromDuration(1000, null)).toBe(1)
    expect(estimatePmAssignmentQuantityFromDuration(null, 1000)).toBe(1)
    expect(estimatePmAssignmentQuantityFromDuration(undefined, undefined)).toBe(1)
  })

  it('returns 1 when start or due date is not finite', () => {
    expect(estimatePmAssignmentQuantityFromDuration(Number.NaN, 1000)).toBe(1)
  })

  it('computes an inclusive day count rounded to the nearest whole day', () => {
    const day = 24 * 60 * 60 * 1000
    const start = 0
    expect(estimatePmAssignmentQuantityFromDuration(start, start)).toBe(1)
    expect(estimatePmAssignmentQuantityFromDuration(start, start + 4 * day)).toBe(5)
  })

  it('never returns less than 1', () => {
    const day = 24 * 60 * 60 * 1000
    expect(estimatePmAssignmentQuantityFromDuration(5 * day, 0)).toBe(1)
  })
})
