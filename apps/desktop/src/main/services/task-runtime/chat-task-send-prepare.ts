import { isTerminalTaskStatus } from './state-machine'
import { getAgentTask, updateAgentTaskRecord } from './store'
import { clearTaskEventLog } from './task-event-log'

export function prepareTaskForChatSend(taskId: string, userText: string) {
  let task = getAgentTask(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  const goal = userText.trim() || task.goal || task.title

  const isActiveRun =
    task.status === 'executing' ||
    task.status === 'reflecting' ||
    task.status === 'retrying'

  const shouldResetForNewGoal =
    isTerminalTaskStatus(task.status) || (goal && goal !== task.goal && !isActiveRun)

  if (shouldResetForNewGoal) {
    task = updateAgentTaskRecord(taskId, {
      status: 'pending',
      goal,
      title: goal.slice(0, 80) || task.title,
      history: [],
      retryCount: 0,
      currentStepId: null,
      metadata: {
        ...task.metadata,
        lastReflection: undefined,
        executorFailureReason: undefined,
        stageGateFailureReason: undefined,
        orchestratorFailureReason: undefined,
      },
    })
    clearTaskEventLog(task)
    return task
  }

  return task
}
