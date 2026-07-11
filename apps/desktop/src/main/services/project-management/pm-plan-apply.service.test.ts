import { describe, expect, it } from 'vitest'

import {
  mergePmScheduleIntoWbsSuggestions,
  pmWbsSuggestionsNeedTreeApply,
  resolvePmWbsSuggestionDates,
} from '@toolman/shared'

/**
 * Pure helpers used by pm-plan-apply.service (tree/date/merge paths).
 * DB-backed apply is covered via shared schema + these unit paths.
 */
describe('pm-plan-apply.service helpers', () => {
  it('detects tree apply when parentTitle or predecessors present', () => {
    expect(pmWbsSuggestionsNeedTreeApply([{ title: 'A' }])).toBe(false)
    expect(
      pmWbsSuggestionsNeedTreeApply([{ title: 'B', parentTitle: 'A' }]),
    ).toBe(true)
    expect(
      pmWbsSuggestionsNeedTreeApply([
        { title: 'B', predecessors: [{ title: 'A', type: 'FS' }] },
      ]),
    ).toBe(true)
  })

  it('merges schedule then resolves duration-backed dates', () => {
    const merged = mergePmScheduleIntoWbsSuggestions(
      [
        { title: '准备', durationDays: 2 },
        { title: '施工', parentTitle: '准备', durationDays: 5 },
      ],
      [
        {
          workItemTitle: '准备',
          suggestedStartDate: '2026-04-01',
          suggestedDueDate: '2026-04-02',
        },
      ],
    )
    expect(merged[0]?.startDate).toBe('2026-04-01')
    const dates = resolvePmWbsSuggestionDates(merged[0]!)
    expect(dates.startDate).toBe(Date.parse('2026-04-01'))
    expect(dates.dueDate).toBe(Date.parse('2026-04-02'))
    expect(pmWbsSuggestionsNeedTreeApply(merged)).toBe(true)
  })
})
