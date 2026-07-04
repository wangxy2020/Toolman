import type { ContentBlock, TaskEvent } from '@toolman/shared'

import { getMessageRepository } from '../../db/repos'
import { emitStreamEvent } from '../agent-generation/emit'

const TASK_STATUS_TEXT = '⏳ 长任务执行中…'

export function formatTaskEventThinkingLine(event: TaskEvent): string | null {
  switch (event.type) {
    case 'task.started':
      return `· 任务已启动：${event.title}`
    case 'task.step.started':
      return `· 步骤开始：${event.stepTitle}`
    case 'task.tool.started':
      return `· 调用工具：${event.toolName}`
    case 'task.tool.finished':
      return event.success
        ? `· 工具完成：${event.toolName}`
        : `· 工具失败：${event.toolName}${event.error ? `（${event.error}）` : ''}`
    case 'task.retry':
      return `· 重试第 ${event.retryCount} 次${event.reason ? `：${event.reason}` : ''}`
    case 'task.checkpoint':
      return `· 已保存检查点`
    case 'task.reflection': {
      const verdictLabel =
        event.verdict === 'pass' ? '通过' : event.verdict === 'fail' ? '未通过' : '需重规划'
      return event.summary
        ? `· 反思${verdictLabel}：${event.summary}`
        : `· 反思${verdictLabel}`
    }
    case 'task.artifact.created':
      return `· 生成产物：${event.name}`
    case 'task.paused':
      return '· 任务已暂停'
    case 'task.resumed':
      return '· 任务已恢复'
    case 'task.finished':
      return event.status === 'completed'
        ? '· 任务已完成'
        : event.status === 'cancelled'
          ? '· 任务已取消'
          : '· 任务失败'
    default:
      return null
  }
}

export function createTaskChatProgressPublisher(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
}) {
  const lines: string[] = ['· 长任务已启动，正在规划…']

  const publish = () => {
    const thinkingText = lines.join('\n')
    const contentBlocks: ContentBlock[] = [
      { type: 'thinking', text: thinkingText },
      { type: 'text', text: TASK_STATUS_TEXT },
    ]

    getMessageRepository().update(options.assistantMessageId, {
      status: 'streaming',
      content: TASK_STATUS_TEXT,
      contentBlocks,
    })

    emitStreamEvent({
      type: 'message.delta',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      modelId: options.modelId,
      delta: { type: 'thinking', text: thinkingText, replace: true },
      timestamp: Date.now(),
    })
  }

  publish()

  return {
    appendEvent(event: TaskEvent) {
      const line = formatTaskEventThinkingLine(event)
      if (!line) return
      lines.push(line)
      publish()
    },
    getThinkingText() {
      return lines.join('\n')
    },
  }
}
