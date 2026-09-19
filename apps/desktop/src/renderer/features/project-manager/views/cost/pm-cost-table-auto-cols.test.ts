import { describe, expect, it } from 'vitest'

import { createEmptyCostRow } from './pm-cost-catalog'
import {
  COST_TABLE_WRAP_COL_MAX_PX,
  computeCostTableAutoColWidths,
  detectCostTableWrapLayout,
  estimateWrappedBlockHeight,
} from './pm-cost-table-auto-cols'

function row(index: number, patch: Partial<ReturnType<typeof createEmptyCostRow>>) {
  return { ...createEmptyCostRow(index, 'constructionQuota', null, 'proj'), ...patch }
}

describe('computeCostTableAutoColWidths', () => {
  it('grows 合价 to fit a large formatted amount', () => {
    const mid = computeCostTableAutoColWidths({
      rows: [row(0, { quantity: 1, unitPrice: 9_999 })],
      labels: { totalPrice: '合价' },
    })
    const wide = computeCostTableAutoColWidths({
      rows: [row(0, { quantity: 1, unitPrice: 115_270_080 })],
      labels: { totalPrice: '合价' },
    })
    expect(wide.totalPrice).toBeGreaterThan(mid.totalPrice ?? 0)
    expect(wide.totalPrice).toBeGreaterThanOrEqual(100)
  })

  it('grows 子项目 to the longest visible label and stays within the cap', () => {
    const widths = computeCostTableAutoColWidths({
      rows: [
        row(0, { subproject: 'A' }),
        row(1, { subproject: 'Kisada Extra High Voltage Substation Lot' }),
      ],
      labels: { subproject: '子项目' },
    })
    expect(widths.subproject).toBeGreaterThan(72)
    expect(widths.subproject).toBeLessThanOrEqual(240)
  })

  it('sizes 合价 from the 分部工程 summary, not only a single row', () => {
    const oneRow = computeCostTableAutoColWidths({
      rows: [row(0, { quantity: 1, unitPrice: 9_999, sectionalWork: 'Schedule4' })],
      labels: { totalPrice: '合价' },
    })
    const sectionSum = computeCostTableAutoColWidths({
      rows: [
        row(0, { quantity: 1, unitPrice: 9_999_999, sectionalWork: 'Schedule4' }),
        row(1, { quantity: 1, unitPrice: 9_999_999, sectionalWork: 'Schedule4' }),
      ],
      labels: { totalPrice: '合价' },
    })
    expect(sectionSum.totalPrice).toBeGreaterThan(oneRow.totalPrice ?? 0)
  })

  it('sizes 合价 from each 子项目 + 分部工程 total, not a cross-subproject sum', () => {
    const combined = computeCostTableAutoColWidths({
      rows: [
        row(0, { quantity: 1, unitPrice: 9_999_999, subproject: 'Kisada', sectionalWork: 'Schedule4' }),
        row(1, { quantity: 1, unitPrice: 9_999_999, subproject: 'Iringa', sectionalWork: 'Schedule4' }),
      ],
      labels: { totalPrice: '合价' },
    })
    const split = computeCostTableAutoColWidths({
      rows: [
        row(0, { quantity: 1, unitPrice: 9_999_999, subproject: 'Kisada', sectionalWork: 'Schedule4' }),
        row(1, { quantity: 1, unitPrice: 9_999_999, subproject: 'Iringa', sectionalWork: 'Schedule4' }),
      ],
      labels: { totalPrice: '合价' },
      groupBy: 'subprojectSection',
    })
    expect(combined.totalPrice).toBeGreaterThan(split.totalPrice ?? 0)
  })

  it('uses the shared max width for 工作名称 when 特征描述 is empty', () => {
    const rows = [
      row(0, { name: 'Supply, install and commission 400kV transformer bay equipment' }),
    ]
    const widths = computeCostTableAutoColWidths({
      rows,
      labels: { name: '工作名称' },
    })
    expect(detectCostTableWrapLayout(rows)).toBe('nameOnly')
    expect(widths.name).toBe(COST_TABLE_WRAP_COL_MAX_PX)
  })

  it('keeps 工作名称 at half of 特征描述 when both columns have content', () => {
    const widths = computeCostTableAutoColWidths({
      rows: [
        row(0, {
          name: '土建工程',
          featureDescription: '含垫层、钢筋、模板及混凝土浇筑，并包括养护及表面处理',
        }),
      ],
      labels: { name: '工作名称', featureDescription: '特征描述' },
    })
    expect(widths.featureDescription).toBeGreaterThan(0)
    expect(widths.featureDescription).toBeLessThanOrEqual(COST_TABLE_WRAP_COL_MAX_PX)
    expect(widths.name).toBe(Math.max(120, Math.round((widths.featureDescription ?? 0) / 2)))
  })

  it('does not let leftover space push wrap columns past the shared max', () => {
    const name =
      'Supply, install, test and commission transformer bay equipment including associated civil works'
    const wide = computeCostTableAutoColWidths({
      rows: [row(0, { name, featureDescription: name })],
      labels: { name: '工作名称', featureDescription: '特征描述' },
      availableWidth: 2200,
    })
    expect(wide.featureDescription).toBeLessThanOrEqual(COST_TABLE_WRAP_COL_MAX_PX)
    expect(wide.name).toBe(Math.max(120, Math.round((wide.featureDescription ?? 0) / 2)))
  })

  it('estimates wrapped 工作名称 taller than a single row', () => {
    const short = estimateWrappedBlockHeight('Bay', 160)
    const long = estimateWrappedBlockHeight(
      'Supply, install, test and commission transformer bay equipment including associated civil works',
      160,
    )
    expect(short).toBe(36)
    expect(long).toBeGreaterThan(36)
  })

  it('treats a hidden 特征描述 as a single 工作名称 column', () => {
    const rows = [
      row(0, { name: '土建工程', featureDescription: '含垫层、钢筋' }),
    ]
    expect(detectCostTableWrapLayout(rows, { featureDescription: false })).toBe('nameOnly')
    const widths = computeCostTableAutoColWidths({
      rows,
      visibility: { featureDescription: false },
      labels: { name: '工作名称' },
    })
    expect(widths.featureDescription).toBeUndefined()
    expect(widths.name).toBe(COST_TABLE_WRAP_COL_MAX_PX)
  })

  it('skips hidden columns', () => {
    const widths = computeCostTableAutoColWidths({
      rows: [row(0, { code: 'BOQ-001' })],
      visibility: { code: false, unit: true },
    })
    expect(widths.code).toBeUndefined()
    expect(widths.unit).toBeTypeOf('number')
  })

  it('estimates wrapped 特征描述 taller than a single row', () => {
    const short = estimateWrappedBlockHeight('Bay', 160)
    const long = estimateWrappedBlockHeight(
      'Including associated civil works, earthing, cabling and commissioning of the complete bay',
      160,
    )
    expect(short).toBe(36)
    expect(long).toBeGreaterThan(36)
  })
})
