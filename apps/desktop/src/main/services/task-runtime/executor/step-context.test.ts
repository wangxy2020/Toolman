import { describe, expect, it } from 'vitest'

import type { AgentTask } from '@toolman/shared'

import {
  buildDirectoryCsvFromFsListOutput,
  findPreviousCompletedToolStep,
  injectStepContextIntoToolArgs,
} from './step-context'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Step context test',
  status: 'executing',
  retryCount: 0,
  history: [],
  budget: {
    preset: 'network',
    maxPlannerTokens: 8000,
    maxExecutorTokensPerStep: 4000,
    maxReflectionTokens: 4000,
    maxTotalTokens: 120_000,
    maxSteps: 30,
    used: { planner: 0, executor: 0, reflection: 0, total: 0 },
  },
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

describe('step-context', () => {
  it('finds the previous completed tool step', () => {
    const task = {
      ...baseTask(),
      history: [
        {
          id: 'step-1',
          kind: 'tool' as const,
          title: 'List',
          status: 'completed' as const,
          output: { text: '[file] a.txt' },
          retryCount: 0,
        },
        {
          id: 'step-2',
          kind: 'tool' as const,
          title: 'Write',
          status: 'pending' as const,
          retryCount: 0,
        },
      ],
    }

    expect(findPreviousCompletedToolStep(task, 'step-2')?.id).toBe('step-1')
  })

  it('builds csv content from fs_list output', () => {
    const csv = buildDirectoryCsvFromFsListOutput('[dir] docs\n[file] readme.md\n')
    expect(csv).toContain('path,type,name')
    expect(csv).toContain(',dir,docs')
    expect(csv).toContain(',file,readme.md')
  })

  it('injects fs_list output into placeholder fs_write content', () => {
    const argsJson = injectStepContextIntoToolArgs(
      'fs_write',
      JSON.stringify({ path: 'listing.csv', content: 'path,type,name\n' }),
      '[file] demo.txt\n',
    )

    const parsed = JSON.parse(argsJson) as { content: string }
    expect(parsed.content).toContain('demo.txt')
    expect(parsed.content).toContain('path,type,name')
  })

  it('replaces explicit previous-output tokens', () => {
    const argsJson = injectStepContextIntoToolArgs(
      'fs_write',
      JSON.stringify({ path: 'out.txt', content: 'Result:\n{{PREV_STEP_OUTPUT}}' }),
      'hello world',
    )

    expect(JSON.parse(argsJson).content).toBe('Result:\nhello world')
  })
})
