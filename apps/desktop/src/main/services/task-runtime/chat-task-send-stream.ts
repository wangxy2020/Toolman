import type { ContentBlock } from '@toolman/shared'

import { getMessageRepository } from '../../db/repos'
import { emitStreamEvent } from '../agent-generation/emit'
import { broadcastSessionMessagesReload } from '../stream-broadcast'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { awaitTaskRun } from './task-queue/task-resume.service'
import { TaskWorkerAbortedError } from './task-queue/task-worker.service'
import { getAgentTask } from './store'
import { subscribeTaskEvents } from './task-event.service'
import { createTaskChatProgressPublisher } from './task-chat-progress'
import {
  buildTaskAssistantContentBlocks,
  readTaskFailureReason,
} from './chat-task-send-helpers'
import { prepareTaskForChatSend } from './chat-task-send-prepare'

function finalizeAssistantMessage(options: {
  sessionId: string
  assistantMessageId: string
  contentBlocks: ContentBlock[]
  status: 'completed' | 'failed'
  error?: { code: 'INTERNAL_ERROR'; message: string; retryable: boolean }
  timestamp?: number
}): void {
  const text = options.contentBlocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')

  const timestamp = options.timestamp ?? Date.now()

  getMessageRepository().update(options.assistantMessageId, {
    status: options.status,
    content: text,
    contentBlocks: options.contentBlocks,
    error: options.status === 'failed' ? (options.error ?? null) : null,
  })

  if (options.status === 'failed' && options.error) {
    emitStreamEvent({
      type: 'message.error',
      sessionId: options.sessionId,
      messageId: options.assistantMessageId,
      error: options.error,
      timestamp,
    })
  }

  emitStreamEvent({
    type: 'message.done',
    sessionId: options.sessionId,
    messageId: options.assistantMessageId,
    contentBlocks: options.contentBlocks,
    tokenUsage: null,
    timestamp,
  })

  broadcastSessionMessagesReload(options.sessionId)
}

function completeAssistantMessage(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  contentBlocks: ContentBlock[]
}): void {
  finalizeAssistantMessage({
    sessionId: options.sessionId,
    assistantMessageId: options.assistantMessageId,
    contentBlocks: options.contentBlocks,
    status: 'completed',
  })
}

function failAssistantMessage(options: {
  sessionId: string
  assistantMessageId: string
  modelId: string
  taskId?: string
  error: unknown
  startedAt: number
  thinkingText?: string
}): void {
  const message = toErrorMessage(options.error, '长任务执行失败')
  const ipcError = {
    code: 'INTERNAL_ERROR' as const,
    message,
    retryable: true,
  }

  const task = options.taskId ? getAgentTask(options.taskId) : null
  const contentBlocks: ContentBlock[] = task
    ? buildTaskAssistantContentBlocks(task, options.thinkingText)
    : options.thinkingText?.trim()
      ? [
          { type: 'thinking', text: options.thinkingText.trim() },
          { type: 'text', text: message },
        ]
      : [{ type: 'text', text: message }]

  if (
    task &&
    contentBlocks.length >= 1 &&
    contentBlocks[contentBlocks.length - 1]?.type === 'text'
  ) {
    const last = contentBlocks[contentBlocks.length - 1]
    if (last?.type === 'text') {
      contentBlocks[contentBlocks.length - 1] = {
        type: 'text',
        text: `${last.text}\n\n⚠️ ${message}`,
      }
    }
  }

  finalizeAssistantMessage({
    sessionId: options.sessionId,
    assistantMessageId: options.assistantMessageId,
    contentBlocks,
    status: 'failed',
    error: ipcError,
    timestamp: options.startedAt,
  })
}

export function skipExtraAssistantMessages(options: {
  sessionId: string
  assistantMessageIds: string[]
}): void {
  const emptyBlocks: ContentBlock[] = [{ type: 'text', text: '' }]

  for (const messageId of options.assistantMessageIds) {
    getMessageRepository().update(messageId, {
      status: 'aborted',
      content: '',
      contentBlocks: emptyBlocks,
    })

    emitStreamEvent({
      type: 'message.done',
      sessionId: options.sessionId,
      messageId,
      contentBlocks: emptyBlocks,
      tokenUsage: null,
      timestamp: Date.now(),
    })
  }
}

export async function runChatTaskOrchestration(options: {
  taskId: string
  sessionId: string
  assistantMessageId: string
  modelId: string
  userText: string
  abortControllers: Map<string, AbortController>
}): Promise<void> {
  const controller = new AbortController()
  options.abortControllers.set(options.assistantMessageId, controller)
  const startedAt = Date.now()
  let thinkingText = ''

  try {
    const prepared = prepareTaskForChatSend(options.taskId, options.userText)
    logStructured(
      'task-runtime',
      'info',
      `chat task orchestration started: taskId=${prepared.id} sessionId=${options.sessionId}`,
    )

    const progress = createTaskChatProgressPublisher({
      sessionId: options.sessionId,
      assistantMessageId: options.assistantMessageId,
      modelId: options.modelId,
    })
    const unsubscribe = subscribeTaskEvents((event) => {
      progress.appendEvent(event)
    }, { taskId: prepared.id })

    let task: ReturnType<typeof getAgentTask>
    try {
      task = await awaitTaskRun(prepared.id, {
        workerId: `chat-${options.assistantMessageId.slice(0, 8)}`,
        signal: controller.signal,
      })
    } finally {
      unsubscribe()
    }

    thinkingText = progress.getThinkingText()
    const contentBlocks = buildTaskAssistantContentBlocks(task, thinkingText)
    if (task.status === 'failed') {
      const reason = readTaskFailureReason(task) ?? '任务失败'
      finalizeAssistantMessage({
        sessionId: options.sessionId,
        assistantMessageId: options.assistantMessageId,
        contentBlocks,
        status: 'failed',
        error: { code: 'INTERNAL_ERROR', message: reason, retryable: true },
      })
    } else {
      completeAssistantMessage({
        sessionId: options.sessionId,
        assistantMessageId: options.assistantMessageId,
        modelId: options.modelId,
        contentBlocks,
      })
    }

    logStructured(
      'task-runtime',
      'info',
      `chat task orchestration finished: taskId=${task.id} status=${task.status}`,
    )
  } catch (error) {
    if (error instanceof TaskWorkerAbortedError) {
      const task = getAgentTask(options.taskId)
      if (task && (task.status === 'paused' || task.status === 'cancelled')) {
        completeAssistantMessage({
          sessionId: options.sessionId,
          assistantMessageId: options.assistantMessageId,
          modelId: options.modelId,
          contentBlocks: buildTaskAssistantContentBlocks(task, thinkingText),
        })
        return
      }
    }

    logStructured(
      'task-runtime',
      'error',
      `chat task orchestration failed: taskId=${options.taskId} error=${toErrorMessage(error, '长任务执行失败')}`,
    )
    failAssistantMessage({
      sessionId: options.sessionId,
      assistantMessageId: options.assistantMessageId,
      modelId: options.modelId,
      taskId: options.taskId,
      error,
      startedAt,
      thinkingText,
    })
  } finally {
    options.abortControllers.delete(options.assistantMessageId)
  }
}
