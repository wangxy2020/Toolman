import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IpcChannel,
  isActiveTaskStatus,
  isTerminalTaskStatus,
  type AgentTask,
  type TaskControlAction,
  type TaskEvent,
} from '@toolman/shared'

import { pickPreferredTaskId } from './task-panel-utils'

const TASK_RELOAD_DEBOUNCE_MS = 200

export function canPauseTask(task: AgentTask): boolean {
  return isActiveTaskStatus(task.status) || task.status === 'pending'
}

export function canResumeTask(task: AgentTask): boolean {
  return task.status === 'paused'
}

export function canCancelTask(task: AgentTask): boolean {
  return !isTerminalTaskStatus(task.status)
}

export function getTaskCurrentStepTitle(task: AgentTask): string | null {
  if (task.currentStepId) {
    const step = task.history.find((item) => item.id === task.currentStepId)
    if (step) return step.title
  }
  const running = task.history.find((item) => item.status === 'running')
  if (running) return running.title
  const pending = task.history.find((item) => item.status === 'pending')
  return pending?.title ?? null
}

function buildSelectionOptions(options: {
  sessionActiveTaskId?: string | null
  latestMessageTaskId?: string | null
}) {
  return {
    sessionActiveTaskId: options.sessionActiveTaskId,
    latestMessageTaskId: options.latestMessageTaskId,
  }
}

function mergeTaskIntoList(items: AgentTask[], task: AgentTask): AgentTask[] {
  const without = items.filter((item) => item.id !== task.id)
  return [task, ...without].sort((a, b) => getTaskRecencyTimestamp(b) - getTaskRecencyTimestamp(a))
}

function getTaskRecencyTimestamp(task: AgentTask): number {
  return Math.max(task.updatedAt, task.createdAt)
}

async function fetchMissingTask(taskId: string): Promise<AgentTask | null> {
  const result = await window.api.invoke(IpcChannel.TaskGet, { taskId })
  if (!result.ok || !result.data) return null
  return result.data as AgentTask
}

export function useAgentTasks(options: {
  workspaceId: string | null | undefined
  sessionId: string | null | undefined
  assistantId: string | null | undefined
  sessionActiveTaskId?: string | null
  latestMessageTaskId?: string | null
}) {
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskIdState] = useState<string | null>(null)
  const [controllingTaskId, setControllingTaskId] = useState<string | null>(null)
  const manualSelectionRef = useRef<string | null>(null)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tasksRef = useRef<AgentTask[]>([])

  tasksRef.current = tasks

  const selectionOptions = useMemo(
    () =>
      buildSelectionOptions({
        sessionActiveTaskId: options.sessionActiveTaskId,
        latestMessageTaskId: options.latestMessageTaskId,
      }),
    [options.latestMessageTaskId, options.sessionActiveTaskId],
  )

  const setSelectedTaskId = useCallback((taskId: string | null) => {
    manualSelectionRef.current = taskId
    setSelectedTaskIdState(taskId)
  }, [])

  const syncSelection = useCallback(
    (items: AgentTask[]) => {
      setSelectedTaskIdState((current) => {
        if (items.length === 0) {
          manualSelectionRef.current = null
          return null
        }

        const manualId = manualSelectionRef.current
        if (manualId && items.some((task) => task.id === manualId)) {
          return manualId
        }
        if (manualId) {
          manualSelectionRef.current = null
        }

        if (current && items.some((task) => task.id === current)) {
          const currentTask = items.find((task) => task.id === current)
          const preferredId = pickPreferredTaskId(items, selectionOptions)
          if (
            currentTask &&
            preferredId &&
            preferredId !== current &&
            isTerminalTaskStatus(currentTask.status)
          ) {
            return preferredId
          }
          return current
        }

        return pickPreferredTaskId(items, selectionOptions)
      })
    },
    [selectionOptions],
  )

  const reload = useCallback(
    async (reloadOptions?: { silent?: boolean }) => {
      const silent = reloadOptions?.silent ?? false

      if (!options.workspaceId) {
        setTasks([])
        setError(null)
        syncSelection([])
        return
      }

      if (!silent || tasksRef.current.length === 0) {
        setLoading(true)
      }
      setError(null)

      const result = await window.api.invoke(IpcChannel.TaskList, {
        workspaceId: options.workspaceId,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        ...(options.assistantId ? { assistantId: options.assistantId } : {}),
        pagination: { limit: 50 },
      })

      if (!result.ok) {
        if (!silent || tasksRef.current.length === 0) {
          setLoading(false)
        }
        setError(result.error.message)
        return
      }

      let items = (result.data as { items: AgentTask[] }).items

      const latestMessageTaskId = options.latestMessageTaskId
      if (
        latestMessageTaskId &&
        !items.some((task) => task.id === latestMessageTaskId)
      ) {
        const missing = await fetchMissingTask(latestMessageTaskId)
        if (missing && missing.workspaceId === options.workspaceId) {
          items = [missing, ...items]
        }
      }

      if (!silent || tasksRef.current.length === 0) {
        setLoading(false)
      }
      setTasks(items)
      syncSelection(items)
    },
    [
      options.assistantId,
      options.latestMessageTaskId,
      options.sessionId,
      options.workspaceId,
      syncSelection,
    ],
  )

  const scheduleReload = useCallback(
    (silent = true) => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current)
      }
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null
        void reload({ silent })
      }, TASK_RELOAD_DEBOUNCE_MS)
    },
    [reload],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    syncSelection(tasks)
  }, [selectionOptions, syncSelection, tasks])

  useEffect(
    () => () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!options.workspaceId) return

    const onTaskCreated = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; task?: AgentTask }>).detail
      const taskId = detail?.taskId
      if (!taskId) return
      manualSelectionRef.current = taskId
      setSelectedTaskIdState(taskId)
      if (detail.task) {
        setTasks((current) => mergeTaskIntoList(current, detail.task!))
      }
      void reload({ silent: true })
    }

    const onTaskUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; task?: AgentTask }>).detail
      if (!detail?.task) return
      setTasks((current) => mergeTaskIntoList(current, detail.task!))
      if (detail.taskId) {
        manualSelectionRef.current = detail.taskId
        setSelectedTaskIdState(detail.taskId)
      }
    }

    window.addEventListener('toolman:agent-task-created', onTaskCreated)
    window.addEventListener('toolman:agent-task-updated', onTaskUpdated)

    const unsubscribe = window.api.subscribe(IpcChannel.TaskStream, (payload) => {
      const event = payload as TaskEvent
      if (event.type === 'task.started') {
        manualSelectionRef.current = event.taskId
        setSelectedTaskIdState(event.taskId)
        void (async () => {
          const task = await fetchMissingTask(event.taskId)
          if (task) {
            setTasks((current) => mergeTaskIntoList(current, task))
          }
          void reload({ silent: true })
        })()
        return
      }

      if (event.type === 'task.finished') {
        void (async () => {
          const task = await fetchMissingTask(event.taskId)
          if (task) {
            setTasks((current) => mergeTaskIntoList(current, task))
          }
          scheduleReload(true)
        })()
        return
      }

      const known = tasksRef.current.some((task) => task.id === event.taskId)
      if (!known) {
        void reload({ silent: true })
        return
      }
      scheduleReload(true)
    })

    return () => {
      window.removeEventListener('toolman:agent-task-created', onTaskCreated)
      window.removeEventListener('toolman:agent-task-updated', onTaskUpdated)
      unsubscribe()
    }
  }, [options.workspaceId, reload, scheduleReload, syncSelection])

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  )

  const controlTask = useCallback(
    async (taskId: string, action: TaskControlAction) => {
      setControllingTaskId(taskId)
      setError(null)

      const result = await window.api.invoke(IpcChannel.TaskControl, { taskId, action })
      setControllingTaskId(null)

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      const data = result.data as { task: AgentTask }
      setTasks((current) =>
        current.map((task) => (task.id === data.task.id ? data.task : task)),
      )
      if (
        data.task.status === 'cancelled' ||
        data.task.status === 'completed' ||
        data.task.status === 'failed'
      ) {
        void reload({ silent: true })
      }
      return true
    },
    [reload],
  )

  return {
    tasks,
    loading,
    error,
    selectedTaskId,
    selectedTask,
    setSelectedTaskId,
    controllingTaskId,
    reload,
    controlTask,
  }
}
