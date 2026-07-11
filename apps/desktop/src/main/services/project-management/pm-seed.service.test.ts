import { describe, expect, it } from 'vitest'

import { MOCK_EPC_PROJECTS } from '@toolman/shared'

import { buildDemoWorkItemSeeds, PM_DEMO_PORTFOLIO_DOMAIN } from './pm-seed.service'

describe('buildDemoWorkItemSeeds', () => {
  const mock = MOCK_EPC_PROJECTS.find((project) => project.code === 'EPC-2412')!

  it('creates progress management demo items', () => {
    const items = buildDemoWorkItemSeeds(mock, 'progress_management')
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items[0]?.type).toBe('wbs_node')
    expect(items.some((item) => item.title.includes('施工'))).toBe(true)
    expect(items.some((item) => item.parentKey === 'wbs')).toBe(true)
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
