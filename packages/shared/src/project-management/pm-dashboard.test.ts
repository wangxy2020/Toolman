import { describe, expect, it } from 'vitest'

import {
  buildPmPortfolioAggregates,
  buildPmProjectDashboardRecords,
  buildPlanProgressKpiCounts,
  dedupePmProjectsByCode,
  resolvePmProjectDashboardRecord,
} from './pm-dashboard.js'
import type { PmProject, PmWorkItem } from './pm-types.js'

const baseProject = (overrides: Partial<PmProject> = {}): PmProject => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  code: 'EPC-2401',
  name: '滨海 LNG 接收站扩建',
  status: 'active',
  domain: 'cost_management',
  metadata: {
    contractValue: 100_000_000,
    settledAmount: 60_000_000,
    pendingAmount: 40_000_000,
    progressPercent: 60,
    planPhase: '施工',
    period: '2026-Q1',
    epcStatus: 'warning',
    region: '华东',
  },
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

describe('resolvePmProjectDashboardRecord', () => {
  it('reads financial fields from project metadata', () => {
    const record = resolvePmProjectDashboardRecord(baseProject())
    expect(record.contractValue).toBe(100_000_000)
    expect(record.settledAmount).toBe(60_000_000)
    expect(record.pendingAmount).toBe(40_000_000)
    expect(record.progressPercent).toBe(60)
    expect(record.status).toBe('warning')
    expect(record.region).toBe('华东')
  })

  it('falls back to work item average progress when metadata is missing', () => {
    const project = baseProject({ metadata: { contractValue: 10 } })
    const workItems: PmWorkItem[] = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        projectId: project.id,
        workspaceId: project.workspaceId,
        type: 'task',
        title: 'A',
        status: 'in_progress',
        priority: 'normal',
        domain: 'cost_management',
        progressPercent: 40,
        sortOrder: 0,
        metadata: {},
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        projectId: project.id,
        workspaceId: project.workspaceId,
        type: 'task',
        title: 'B',
        status: 'in_progress',
        priority: 'normal',
        domain: 'cost_management',
        progressPercent: 80,
        sortOrder: 1,
        metadata: {},
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    const record = resolvePmProjectDashboardRecord(project, workItems)
    expect(record.progressPercent).toBe(60)
  })

  it('does not use project description as the period chip', () => {
    const record = resolvePmProjectDashboardRecord(
      baseProject({
        description: '本项目拟建教学楼1栋，地上6层，建筑面积5310.38㎡。',
        metadata: {
          contractValue: 10,
          planPhase: '施工',
          region: '华东',
        },
        code: 'PRJ-ONLY',
      }),
    )
    expect(record.period).toBe('—')
    expect(record.period).not.toContain('教学楼')
  })
})

describe('dedupePmProjectsByCode', () => {
  it('keeps the most recently updated project per code', () => {
    const older = baseProject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      domain: 'cost_management',
      updatedAt: 10,
    })
    const newer = baseProject({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      domain: 'progress_management',
      updatedAt: 20,
    })

    const deduped = dedupePmProjectsByCode([older, newer])
    expect(deduped).toHaveLength(1)
    expect(deduped[0]?.id).toBe(newer.id)
  })
})

describe('buildPmPortfolioAggregates', () => {
  it('aggregates portfolio metrics from sqlite-backed projects', () => {
    const projects = [
      baseProject(),
      baseProject({
        id: '55555555-5555-4555-8555-555555555555',
        code: 'EPC-2408',
        metadata: {
          contractValue: 50_000_000,
          settledAmount: 25_000_000,
          pendingAmount: 25_000_000,
          progressPercent: 50,
          epcStatus: 'normal',
        },
      }),
    ]

    const records = buildPmProjectDashboardRecords(projects)
    const aggregates = buildPmPortfolioAggregates(projects)

    expect(records).toHaveLength(2)
    expect(aggregates.projectCount).toBe(2)
    expect(aggregates.contractTotal).toBe(150_000_000)
    expect(aggregates.settledTotal).toBe(85_000_000)
    expect(aggregates.pendingTotal).toBe(65_000_000)
  })
})

describe('buildPlanProgressKpiCounts', () => {
  const now = new Date(2026, 7, 15).getTime()

  function workItem(patch: Partial<PmWorkItem> & Pick<PmWorkItem, 'id' | 'title'>): PmWorkItem {
    return {
      projectId: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      type: 'task',
      status: 'todo',
      priority: 'normal',
      domain: 'progress_management',
      progressPercent: 20,
      sortOrder: 0,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      ...patch,
    }
  }

  it('counts this-month milestones, work items, and risk work', () => {
    const items = [
      workItem({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        title: 'milestone this month',
        type: 'milestone',
        dueDate: new Date(2026, 7, 20).getTime(),
      }),
      workItem({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        title: 'task this month',
        startDate: new Date(2026, 7, 2).getTime(),
      }),
      workItem({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        title: 'blocked',
        status: 'blocked',
        updatedAt: new Date(2026, 6, 1).getTime(),
      }),
      workItem({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
        title: 'next month',
        type: 'milestone',
        dueDate: new Date(2026, 8, 2).getTime(),
        updatedAt: new Date(2026, 6, 1).getTime(),
      }),
    ]
    expect(buildPlanProgressKpiCounts(items, now)).toEqual({
      monthMilestoneCount: 1,
      monthWorkItemCount: 2,
      riskWorkItemCount: 1,
    })
  })
})
