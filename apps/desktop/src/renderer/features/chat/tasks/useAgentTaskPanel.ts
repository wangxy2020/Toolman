import { useMemo } from 'react'
import type { Message } from '@toolman/shared'

import { resolveLatestMessageTaskId } from './task-panel-utils'
import { useAgentTasks } from './useAgentTasks'

export function useAgentTaskPanel(options: {
  workspaceId: string | null | undefined
  sessionId: string | null | undefined
  assistantId: string | null | undefined
  sessionActiveTaskId?: string | null
  messages: Message[]
}) {
  const latestMessageTaskId = useMemo(
    () => resolveLatestMessageTaskId(options.messages),
    [options.messages],
  )

  const taskPanel = useAgentTasks({
    workspaceId: options.workspaceId,
    sessionId: options.sessionId,
    assistantId: options.assistantId,
    sessionActiveTaskId: options.sessionActiveTaskId,
    latestMessageTaskId,
  })

  const handlers = useMemo(
    () => ({
      onSelectTask: taskPanel.setSelectedTaskId,
      onPauseTask: (taskId: string) => void taskPanel.controlTask(taskId, 'pause'),
      onResumeTask: (taskId: string) => void taskPanel.controlTask(taskId, 'resume'),
      onCancelTask: (taskId: string) => void taskPanel.controlTask(taskId, 'cancel'),
    }),
    [taskPanel.controlTask, taskPanel.setSelectedTaskId],
  )

  return {
    ...taskPanel,
    ...handlers,
    latestMessageTaskId,
  }
}
