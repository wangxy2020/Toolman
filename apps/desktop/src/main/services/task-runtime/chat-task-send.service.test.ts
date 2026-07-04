import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('./store', () => ({
  getAgentTask: vi.fn(),
  updateAgentTaskRecord: vi.fn(),
}))

vi.mock('./orchestrator/orchestrator.service', () => ({
  runTaskOrchestrator: vi.fn(),
}))

vi.mock('../../db/repos', () => ({
  getMessageRepository: vi.fn(() => ({
    update: vi.fn(),
  })),
}))

vi.mock('../agent-generation/emit', () => ({
  emitStreamEvent: vi.fn(),
}))

vi.mock('./task-event-log', () => ({
  clearTaskEventLog: vi.fn(),
}))

vi.mock('./task-output-files', () => ({
  discoverTaskOutputFilePaths: vi.fn(() => []),
  resolveTaskOutputFileLinks: vi.fn(() => []),
  collectTaskOutputPathsFromHistory: vi.fn(() => []),
  extractFileCandidatesFromText: vi.fn((text: string) => {
    const match = text.match(/([^\s]+\.(?:xlsx?|csv|docx?|pdf|txt|md))/i)
    return match?.[1] ? [match[1]] : []
  }),
  resolveTaskOutputFilePath: vi.fn((_task: unknown, candidate: string) => candidate),
}))

import { clearTaskEventLog } from './task-event-log'
import { resolveTaskOutputFileLinks } from './task-output-files'
import { getAgentTask, updateAgentTaskRecord } from './store'
import {
  buildTaskAssistantContentBlocks,
  buildTaskAssistantReply,
  normalizeTaskAssistantText,
  prepareTaskForChatSend,
} from './chat-task-send.service'

const baseTask = (): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: 'Chat task',
  goal: '整理 notes 目录',
  status: 'pending',
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

describe('prepareTaskForChatSend', () => {
  beforeEach(() => {
    vi.mocked(getAgentTask).mockReset()
    vi.mocked(updateAgentTaskRecord).mockReset()
  })

  it('resets terminal tasks for a new chat run', () => {
    const task = { ...baseTask(), status: 'completed' as const, history: [{ id: '1', kind: 'tool' as const, title: 'x', status: 'completed' as const, retryCount: 0 }] }
    vi.mocked(getAgentTask).mockReturnValue(task)
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
      history: patch.history ?? task.history,
    }) as AgentTask)

    const result = prepareTaskForChatSend(task.id, '新的目标')

    expect(result.status).toBe('pending')
    expect(result.history).toEqual([])
    expect(result.goal).toBe('新的目标')
    expect(clearTaskEventLog).toHaveBeenCalled()
  })

  it('resets active tasks when goal changes', () => {
    const task = {
      ...baseTask(),
      history: [{ id: '1', kind: 'tool' as const, title: 'x', status: 'pending' as const, retryCount: 0 }],
    }
    vi.mocked(getAgentTask).mockReturnValue(task)
    vi.mocked(updateAgentTaskRecord).mockImplementation((_taskId, patch) => ({
      ...task,
      ...patch,
      history: patch.history ?? task.history,
    }) as AgentTask)

    const result = prepareTaskForChatSend(task.id, '调整后的目标')

    expect(result.goal).toBe('调整后的目标')
    expect(result.history).toEqual([])
    expect(result.status).toBe('pending')
    expect(clearTaskEventLog).toHaveBeenCalled()
  })

  it('does not reset an executing task when follow-up text differs slightly', () => {
    const task = {
      ...baseTask(),
      status: 'executing' as const,
      goal: '整理 notes 目录',
      history: [{ id: '1', kind: 'tool' as const, title: 'x', status: 'completed' as const, retryCount: 0 }],
    }
    vi.mocked(getAgentTask).mockReturnValue(task)

    const result = prepareTaskForChatSend(task.id, '整理 notes 目录并导出 CSV')

    expect(result.goal).toBe('整理 notes 目录')
    expect(result.history).toHaveLength(1)
    expect(updateAgentTaskRecord).not.toHaveBeenCalled()
  })
})

describe('buildTaskAssistantReply', () => {
  it('uses reflection summary for completed tasks', () => {
    const task: AgentTask = {
      ...baseTask(),
      status: 'completed',
      metadata: {
        lastReflection: {
          verdict: 'pass',
          reason: 'ok',
          summary: '已完成文件整理',
        },
      },
    }

    expect(buildTaskAssistantReply(task)).toBe('已完成文件整理')
  })

  it('replaces unreliable reflection summary when output files exist', () => {
    vi.mocked(resolveTaskOutputFileLinks).mockReturnValueOnce(['/tmp/directory_list.xlsx'])

    const task: AgentTask = {
      ...baseTask(),
      status: 'completed',
      metadata: {
        lastReflection: {
          verdict: 'pass',
          summary:
            '已扫描文件夹内容并通过 Python 脚本生成 Excel 目录，未包含任务图标。',
        },
      },
    }

    expect(buildTaskAssistantReply(task)).toBe('任务已完成，生成的文件见下方链接。')
  })

  it('includes failure reason for failed tasks', () => {
    const task: AgentTask = {
      ...baseTask(),
      status: 'failed',
      metadata: {
        executorFailureReason: 'tool boom',
      },
    }

    expect(buildTaskAssistantReply(task)).toBe('任务失败：tool boom')
  })

  it('normalizes task text and removes inline path when file links exist', () => {
    expect(
      normalizeTaskAssistantText('✅ 文件已生成！ 路径：`demo.xlsx`', ['/tmp/demo.xlsx']),
    ).toBe('✅ 文件已生成！')
    expect(
      normalizeTaskAssistantText('✅ 文件已生成\n保存位置： /tmp/demo.xlsx', ['/tmp/demo.xlsx']),
    ).toBe('✅ 文件已生成')
  })

  it('keeps reflection summary when output files exist on failed task', () => {
    vi.mocked(resolveTaskOutputFileLinks).mockReturnValueOnce(['/tmp/demo.xlsx'])

    const task: AgentTask = {
      ...baseTask(),
      status: 'failed',
      metadata: {
        executorFailureReason: 'reflection mismatch',
        lastReflection: {
          verdict: 'fail',
          reason: 'reflection mismatch',
          summary: '✅ 文件已生成！ 路径：demo.xlsx',
        },
      },
    }

    const reply = buildTaskAssistantReply(task)
    expect(reply).toContain('✅ 文件已生成')
    expect(reply).toContain('reflection mismatch')
  })
})

describe('buildTaskAssistantContentBlocks', () => {
  beforeEach(() => {
    vi.mocked(resolveTaskOutputFileLinks).mockReset()
    vi.mocked(resolveTaskOutputFileLinks).mockReturnValue([])
  })

  it('includes local_file_links when output files are discovered', () => {
    vi.mocked(resolveTaskOutputFileLinks).mockReturnValue([
      '/Users/demo/project/directory_listing.csv',
    ])

    const task: AgentTask = {
      ...baseTask(),
      status: 'completed',
      metadata: {
        lastReflection: {
          verdict: 'pass',
          summary: '已将目录清单写入 directory_listing.csv。',
        },
      },
    }

    const blocks = buildTaskAssistantContentBlocks(task)
    expect(blocks[0]?.type).toBe('text')
    expect(blocks.some((block) => block.type === 'local_file_links')).toBe(true)
    const links = blocks.find((block) => block.type === 'local_file_links')
    expect(links?.type).toBe('local_file_links')
    if (links?.type === 'local_file_links') {
      expect(links.paths).toContain('/Users/demo/project/directory_listing.csv')
      expect(links.title).toBe('生成的文件')
    }
  })
})
