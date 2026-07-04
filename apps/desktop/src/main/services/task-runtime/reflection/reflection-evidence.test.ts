import { describe, expect, it } from 'vitest'

import type { AgentTask } from '@toolman/shared'

import {
  rejectReflectionPassWithoutEvidence,
  validateTaskPassEvidence,
} from './reflection-evidence'

const baseTask = (patch: Partial<AgentTask> = {}): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Evidence test',
  goal: patch.goal ?? '检查价格表并统计 IPC 金额',
  status: 'executing',
  retryCount: 0,
  history: patch.history ?? [],
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
  ...patch,
})

describe('reflection-evidence', () => {
  it('rejects pass when excel analysis goal has only trivial bash output', () => {
    const task = baseTask({
      history: [
        {
          id: 'step-1',
          kind: 'tool',
          title: 'bash',
          status: 'completed',
          input: { toolName: 'bash', argsJson: '{}' },
          output: { text: '已写入文件: summary_report.csv\n' },
          retryCount: 0,
        },
      ],
    })

    const result = validateTaskPassEvidence(task)
    expect(result.ok).toBe(false)
  })

  it('downgrades hallucinated pass from reflection model', () => {
    const task = baseTask({
      history: [
        {
          id: 'step-1',
          kind: 'tool',
          title: 'bash',
          status: 'completed',
          input: { toolName: 'bash', argsJson: '{}' },
          output: { text: 'done' },
          retryCount: 0,
        },
      ],
    })

    const adjusted = rejectReflectionPassWithoutEvidence(task, {
      verdict: 'pass',
      reason: 'all good',
      summary: '任务执行完毕，产物为 summary_report.csv。',
    })

    expect(adjusted.verdict).toBe('fail')
    expect(adjusted.reason).toMatch(/未找到|统计/)
  })
})
