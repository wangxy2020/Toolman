import { describe, expect, it } from 'vitest'

import {
  createDefaultFeatureCatalog,
  createEmptyFeatureRow,
  isPmFeatureType,
  mergeSharedIntoProjectFeatureCatalog,
  PM_FEATURE_TYPES,
  pruneLegacyScheduleFeaturePlaceholders,
  reindexFeatureRows,
  stripScheduleFeatureRows,
} from './pm-features-catalog'

describe('pm-features-catalog', () => {
  it('exposes the practice type set used by the Features menubar', () => {
    expect(PM_FEATURE_TYPES).toEqual([
      'labor',
      'auxiliary',
      'material',
      'machinery',
      'procurement',
      'metering',
      'node',
      'funds',
    ])
    expect(isPmFeatureType('machinery')).toBe(true)
    expect(isPmFeatureType('auxiliary')).toBe(true)
    expect(isPmFeatureType('equipment')).toBe(false)
  })

  it('seeds defaults for non-schedule types only', () => {
    const rows = createDefaultFeatureCatalog()
    expect(rows.map((row) => row.type).sort()).toEqual([
      'funds',
      'metering',
      'node',
      'procurement',
    ])
    expect(rows.some((row) => row.type === 'labor')).toBe(false)
  })

  it('prunes legacy labor/material/machinery placeholders', () => {
    const rows = [
      { ...createEmptyFeatureRow(0, 'labor'), name: '现场管理人员配置' },
      { ...createEmptyFeatureRow(1, 'labor'), name: '普通工' },
      { ...createEmptyFeatureRow(2, 'material'), name: '主材进场计划' },
      { ...createEmptyFeatureRow(3, 'procurement'), name: '招标采购计划' },
    ]
    const pruned = pruneLegacyScheduleFeaturePlaceholders(rows)
    expect(pruned.changed).toBe(true)
    expect(pruned.rows.map((row) => row.name)).toEqual(['普通工', '招标采购计划'])
  })

  it('strips all schedule feature rows from persisted catalogs', () => {
    const rows = [
      { ...createEmptyFeatureRow(0, 'labor'), name: '技术工人' },
      { ...createEmptyFeatureRow(1, 'labor'), name: '普通工' },
      { ...createEmptyFeatureRow(2, 'machinery'), name: '挖掘机' },
      { ...createEmptyFeatureRow(3, 'procurement'), name: '招标采购计划' },
    ]
    const stripped = stripScheduleFeatureRows(rows)
    expect(stripped.changed).toBe(true)
    expect(stripped.rows.map((row) => row.name)).toEqual(['招标采购计划'])
  })

  it('reindexes and merges shared rows by type+name', () => {
    const project = [createEmptyFeatureRow(0, 'procurement')].map((row) => ({
      ...row,
      name: '招标采购计划',
    }))
    const shared = createDefaultFeatureCatalog()
    const merged = mergeSharedIntoProjectFeatureCatalog(project, shared)
    expect(merged.changed).toBe(true)
    expect(merged.rows.some((row) => row.type === 'funds')).toBe(true)
    expect(reindexFeatureRows(merged.rows).every((row, index) => row.sortOrder === index)).toBe(
      true,
    )
  })
})
