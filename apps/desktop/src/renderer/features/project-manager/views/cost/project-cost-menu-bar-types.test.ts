import { describe, expect, it } from 'vitest'

import {
  COST_PRACTICE_VIEW_MENU_FILTERS,
  COST_PRACTICE_VIEW_PAGES,
  DEFAULT_COST_PRACTICE_VIEW_FILTER,
  isCostPracticeViewPage,
} from './project-cost-menu-bar-types'

describe('cost practice view pages', () => {
  it('lists interim metering first and price list last', () => {
    expect(COST_PRACTICE_VIEW_PAGES).toEqual([
      'meteringTable',
      'progressPaymentSummary',
      'paymentSummary',
    ])
    expect(COST_PRACTICE_VIEW_MENU_FILTERS).toEqual([
      'meteringTable',
      'progressPaymentSummary',
      'paymentSummary',
      'all',
    ])
    expect(DEFAULT_COST_PRACTICE_VIEW_FILTER).toBe('meteringTable')
  })

  it('recognizes only those reserved practice pages', () => {
    expect(isCostPracticeViewPage('meteringTable')).toBe(true)
    expect(isCostPracticeViewPage('comprehensive')).toBe(false)
    expect(isCostPracticeViewPage('all')).toBe(false)
  })
})
