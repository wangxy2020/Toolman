import { describe, expect, it } from 'vitest'

import {
  COST_PRACTICE_VIEW_PAGES,
  isCostPracticeViewPage,
} from './project-cost-menu-bar-types'

describe('cost practice view pages', () => {
  it('lists interim metering, progress-payment, and payment statistics after all types', () => {
    expect(COST_PRACTICE_VIEW_PAGES).toEqual([
      'meteringTable',
      'progressPaymentSummary',
      'paymentSummary',
    ])
  })

  it('recognizes only those reserved practice pages', () => {
    expect(isCostPracticeViewPage('meteringTable')).toBe(true)
    expect(isCostPracticeViewPage('comprehensive')).toBe(false)
    expect(isCostPracticeViewPage('all')).toBe(false)
  })
})
