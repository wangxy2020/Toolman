import { describe, expect, it } from 'vitest'

import {
  getCenterAlignedColumnIndexes,
  isLabelValueTableHeaders,
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

describe('md-table-alignment label-value', () => {
  it('treats 项目/内容 and other two-column tables as label-value', () => {
    expect(isLabelValueTableHeaders(['项目', '内容'])).toBe(true)
    expect(isLabelValueTableHeaders(['字段', '值'])).toBe(true)
    expect(isLabelValueTableHeaders(['Key', 'Value'])).toBe(true)
    expect(isLabelValueTableHeaders(['A', 'B'])).toBe(true)
  })

  it('does not treat multi-column tables as label-value', () => {
    expect(isLabelValueTableHeaders(['序号', '名称', '数量'])).toBe(false)
    expect(isLabelValueTableHeaders(['项目'])).toBe(false)
  })
})

describe('md-table-alignment resource analysis', () => {
  it('centers short metric columns in multi-column agent tables', () => {
    const indexes = getCenterAlignedColumnIndexes([
      '资源',
      '当前单价',
      '计价单位',
      '市场参考',
      '合理?',
      '分析',
    ])
    expect([...indexes].sort()).toEqual([1, 2, 3, 4])
  })
})
