import { describe, expect, it } from 'vitest'

import { formatTaskEventThinkingLine } from './task-chat-progress'

describe('formatTaskEventThinkingLine', () => {
  it('formats step and tool events', () => {
    expect(
      formatTaskEventThinkingLine({
        type: 'task.step.started',
        taskId: 't1',
        workspaceId: 'w1',
        timestamp: 1,
        stepId: 's1',
        stepKind: 'tool',
        stepTitle: '读取数据',
      }),
    ).toBe('· 步骤开始：读取数据')

    expect(
      formatTaskEventThinkingLine({
        type: 'task.tool.finished',
        taskId: 't1',
        workspaceId: 'w1',
        timestamp: 1,
        toolName: 'bash',
        success: false,
        error: 'exit 1',
      }),
    ).toBe('· 工具失败：bash（exit 1）')
  })
})
