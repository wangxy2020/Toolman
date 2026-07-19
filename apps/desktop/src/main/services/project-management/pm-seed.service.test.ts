import { describe, expect, it } from 'vitest'

import { MOCK_EPC_PROJECTS, PM_BUILTIN_EMP_2401 } from '@toolman/shared'

import { buildDemoWorkItemSeeds, PM_DEMO_PORTFOLIO_DOMAIN } from './pm-seed.service'

describe('buildDemoWorkItemSeeds', () => {
  const mock = MOCK_EPC_PROJECTS.find((project) => project.code === 'EPC-2412')!

  it('creates progress management demo items', () => {
    const items = buildDemoWorkItemSeeds(mock, 'progress_management')
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.some((item) => item.key === 'wbs')).toBe(false)
    expect(items.some((item) => item.title.includes('进度 WBS'))).toBe(false)
    expect(items.every((item) => item.parentKey == null)).toBe(true)
    expect(items.some((item) => item.title.includes('阶段主线'))).toBe(true)
  })

  it('creates cost management demo items', () => {
    const items = buildDemoWorkItemSeeds(mock, 'cost_management')
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.some((item) => item.title.includes('IPC'))).toBe(true)
  })
})

describe('pm demo portfolio', () => {
  it('keeps a fixed set of six mock EPC projects on one canonical domain', () => {
    expect(MOCK_EPC_PROJECTS).toHaveLength(6)
    expect(PM_DEMO_PORTFOLIO_DOMAIN).toBe('progress_management')
    expect(new Set(MOCK_EPC_PROJECTS.map((project) => project.code)).size).toBe(6)
  })
})

describe('PM_BUILTIN_EMP_2401', () => {
  it('ships the owner-managed master plan as program builtin data', () => {
    expect(PM_BUILTIN_EMP_2401.code).toBe('EMP-2401')
    expect(PM_BUILTIN_EMP_2401.name).toContain('政府投资类项目总控计划')
    expect(PM_BUILTIN_EMP_2401.metadata.source).toBe('builtin')
    expect(PM_BUILTIN_EMP_2401.metadata.projectType).toBe('owner_managed')
    expect(PM_BUILTIN_EMP_2401.workItems.length).toBeGreaterThanOrEqual(20)
    expect(PM_BUILTIN_EMP_2401.relations.length).toBeGreaterThanOrEqual(20)
    expect(PM_BUILTIN_EMP_2401.baselineName).toBe('内置基线')
    expect(PM_BUILTIN_EMP_2401.metadata.resourceCatalog).toBeUndefined()

    const keys = new Set(PM_BUILTIN_EMP_2401.workItems.map((item) => item.key))
    expect(keys.size).toBe(PM_BUILTIN_EMP_2401.workItems.length)
    for (const relation of PM_BUILTIN_EMP_2401.relations) {
      expect(keys.has(relation.fromKey)).toBe(true)
      expect(keys.has(relation.toKey)).toBe(true)
    }
    for (const item of PM_BUILTIN_EMP_2401.workItems) {
      if (item.parentKey) expect(keys.has(item.parentKey)).toBe(true)
    }
  })
})
