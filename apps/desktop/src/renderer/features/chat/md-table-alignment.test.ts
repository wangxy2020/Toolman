import { describe, expect, it } from 'vitest'

import {
  getCenterAlignedColumnIndexes,
  isPmPlanTableHeaders,
} from './md-table-alignment'

describe('md-table-alignment pm plan', () => {
  it('detects plan WBS headers', () => {
    expect(
      isPmPlanTableHeaders(['层级', '任务名称', '工期(天)', '开始日期', '完成日期', '前置任务']),
    ).toBe(true)
    expect(isPmPlanTableHeaders(['序号', '数量', '名称'])).toBe(false)
  })

  it('centers outline duration and dates for plan tables', () => {
    const indexes = getCenterAlignedColumnIndexes([
      '层级',
      '任务名称',
      '工期(天)',
      '开始日期',
      '完成日期',
      '前置任务',
    ])
    expect([...indexes].sort()).toEqual([0, 2, 3, 4])
  })
})
