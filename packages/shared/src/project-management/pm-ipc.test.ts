import { describe, expect, it } from 'vitest'

import {
  PmProjectCreateInputSchema,
  PmProjectListInputSchema,
  PmWorkItemCreateInputSchema,
  PmWorkItemListInputSchema,
} from '../ipc/pm.js'
import { PmApplyWbsInputSchema } from './pm-plan-apply.js'

describe('pm ipc schemas', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000002'
  const projectId = '550e8400-e29b-41d4-a716-446655440000'

  it('parses project list input', () => {
    const parsed = PmProjectListInputSchema.parse({
      workspaceId,
      domain: 'cost_management',
    })
    expect(parsed.domain).toBe('cost_management')
  })

  it('parses project create input', () => {
    const parsed = PmProjectCreateInputSchema.parse({
      workspaceId,
      code: 'PRJ-01',
      name: 'Demo project',
      domain: 'progress_management',
    })
    expect(parsed.code).toBe('PRJ-01')
  })

  it('parses work item list input', () => {
    const parsed = PmWorkItemListInputSchema.parse({
      workspaceId,
      projectId,
      domain: 'progress_management',
      status: 'todo',
    })
    expect(parsed.status).toBe('todo')
  })

  it('parses work item list input with urgent filter', () => {
    const parsed = PmWorkItemListInputSchema.parse({
      workspaceId,
      urgentOnly: true,
      rootOnly: true,
      priority: 'urgent',
    })
    expect(parsed.urgentOnly).toBe(true)
  })

  it('parses work item create input', () => {
    const parsed = PmWorkItemCreateInputSchema.parse({
      workspaceId,
      projectId,
      domain: 'cost_management',
      title: 'Review IPC payment sheet',
    })
    expect(parsed.title).toContain('IPC')
  })
})

describe('pm plan apply ipc schemas', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000002'

  it('parses full plan apply input with createProject', () => {
    const parsed = PmApplyWbsInputSchema.parse({
      workspaceId,
      suggestions: [
        {
          title: '分部',
          parentTitle: '单位',
          durationDays: 10,
          predecessors: [{ title: '准备', type: 'FS' }],
        },
      ],
      createProject: { name: 'Toolman项目1', clearExisting: true },
      projectPlan: { planStart: '2026-01-01', planFinish: '2026-02-01', durationDays: 30 },
    })
    expect(parsed.createProject?.clearExisting).toBe(true)
    expect(parsed.suggestions[0]?.predecessors?.[0]?.type).toBe('FS')
  })
})
