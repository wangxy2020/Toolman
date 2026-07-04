import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  IpcChannel,
  isTerminalTaskStatus,
  parseMessageTaskId,
  parseSessionActiveTaskId,
  type AgentTask,
  type Assistant,
  type ContentBlock,
  type Message,
  type TaskEvent,
  type Workspace,
} from '@toolman/shared'
import { getBlocksText } from './message-utils'
import {
  isGroupProxySession,
  resolveGroupProxyAssistantModelId,
} from '../group/group-agent-utils'
import type { AppSettings } from '../settings/app-settings'
import type { useSessionManager } from './useSessionManager'
import {
  getAssistantMcpServerIds,
  getAssistantSkillIds,
  resolveChatEnableTools,
} from './useChat-utils'
import type { ChatStreamingRefs } from './useChatMessageRefs'
import {
  sendEditedUserMessage,
  sendNewUserMessage,
  type ChatSendContext,
} from './useChatSendOperations'

type SessionManager = ReturnType<typeof useSessionManager>

export type ChatSendOptions = {
  enableTools: boolean
  webSearchEnabled?: boolean
  webSearchProvider?: AppSettings['webSearchProvider']
  kbEnabled?: boolean
  kbIds?: string[]
  kbTopK?: number
  kbScoreThreshold?: number
  memoryEnabled?: boolean
  memoryRetentionDays?: number
  mcpServerIds: string[]
  documentOcrEnabled?: boolean
  taskId?: string
}

export function buildSendOptions(
  session: SessionManager,
  assistants: Assistant[],
  appSettings: AppSettings | undefined,
  contentBlocks?: ContentBlock[],
): ChatSendOptions {
  const activeAssistant = (() => {
    const assistantId = session.activeSession?.assistantId
    if (assistantId) {
      return assistants.find((assistant) => assistant.id === assistantId) ?? null
    }
    return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
  })()

  const mcpServerIds = getAssistantMcpServerIds(activeAssistant)
  const skillIds = getAssistantSkillIds(activeAssistant)

  return {
    enableTools: resolveChatEnableTools(mcpServerIds, skillIds, contentBlocks ?? []),
    webSearchEnabled: appSettings?.webSearchEnabled,
    webSearchProvider: appSettings?.webSearchProvider,
    kbEnabled: appSettings?.kbEnabled,
    kbIds: activeAssistant?.parameters.kbIds,
    kbTopK: activeAssistant?.parameters.kbTopK,
    kbScoreThreshold: activeAssistant?.parameters.kbScoreThreshold,
    memoryEnabled: appSettings?.memoryEnabled,
    memoryRetentionDays: appSettings?.memoryRetentionDays,
    mcpServerIds,
    documentOcrEnabled: appSettings?.documentOcrEnabled,
  }
}

function resolveOutboundTaskId(options: {
  autonomousTaskMode: boolean
  sessionActiveTaskId?: string
  boundTask: AgentTask | null
}): string | undefined {
  const { autonomousTaskMode, sessionActiveTaskId, boundTask } = options
  if (!autonomousTaskMode) {
    return undefined
  }
  if (sessionActiveTaskId && boundTask && !isTerminalTaskStatus(boundTask.status)) {
    return sessionActiveTaskId
  }
  return undefined
}

const AUTONOMOUS_TASK_MODE_KEY = 'toolman:autonomous-task-mode'

function writePersistedAutonomousTaskMode(sessionId: string, enabled: boolean): void {
  try {
    sessionStorage.setItem(`${AUTONOMOUS_TASK_MODE_KEY}:${sessionId}`, enabled ? '1' : '0')
  } catch {
    // ignore storage errors
  }
}

function isSessionTaskBindingLocked(
  sessionActiveTaskId: string | undefined,
  autonomousTaskMode: boolean,
  boundTask: AgentTask | null,
): boolean {
  if (!sessionActiveTaskId || autonomousTaskMode) return false
  if (!boundTask) return false
  return !isTerminalTaskStatus(boundTask.status)
}

export function useChatSend(
  session: SessionManager,
  streamingRefs: ChatStreamingRefs,
  deps: {
    assistants: Assistant[]
    selectedModelIds: string[]
    appSettings?: AppSettings
    messages: Message[]
    setMessages: Dispatch<SetStateAction<Message[]>>
    loadMessages: (sessionId: string) => Promise<void>
    editingUserMessageId: string | null
    setEditingUserMessageId: (id: string | null) => void
    setError: (msg: string | null) => void
  },
) {
  const {
    assistants,
    selectedModelIds,
    appSettings,
    messages,
    setMessages,
    loadMessages,
    editingUserMessageId,
    setEditingUserMessageId,
    setError,
  } = deps

  const [sending, setSending] = useState(false)
  const [autonomousTaskMode, setAutonomousTaskMode] = useState(false)
  const [boundTask, setBoundTask] = useState<AgentTask | null>(null)
  const { streamingIds } = streamingRefs

  const sessionActiveTaskId = useMemo(
    () => parseSessionActiveTaskId(session.activeSession?.metadata),
    [session.activeSession?.metadata],
  )

  const sessionTaskBindingLocked = isSessionTaskBindingLocked(
    sessionActiveTaskId,
    autonomousTaskMode,
    boundTask,
  )

  const taskModeActive = autonomousTaskMode

  const activeAssistant = useMemo(() => {
    const assistantId = session.activeSession?.assistantId
    if (assistantId) {
      return assistants.find((assistant) => assistant.id === assistantId) ?? null
    }
    return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
  }, [assistants, session.activeSession?.assistantId])

  const longTaskEnabled = activeAssistant?.parameters.longTaskMode ?? false

  useEffect(() => {
    if (!session.activeSessionId) {
      setAutonomousTaskMode(false)
      return
    }
    if (!longTaskEnabled) {
      setAutonomousTaskMode(false)
      writePersistedAutonomousTaskMode(session.activeSessionId, false)
      return
    }
    setAutonomousTaskMode(true)
    writePersistedAutonomousTaskMode(session.activeSessionId, true)
  }, [session.activeSessionId, longTaskEnabled])

  useEffect(() => {
    if (!sessionActiveTaskId) {
      setBoundTask(null)
      return
    }

    let cancelled = false
    void (async () => {
      const result = await window.api.invoke(IpcChannel.TaskGet, { taskId: sessionActiveTaskId })
      if (cancelled) return
      if (result.ok && result.data) {
        const task = result.data as AgentTask
        if (isTerminalTaskStatus(task.status)) {
          setBoundTask(null)
          void session.loadSessions()
          return
        }
        setBoundTask(task)
        return
      }
      setBoundTask(null)
    })()

    return () => {
      cancelled = true
    }
  }, [sessionActiveTaskId])

  useEffect(() => {
    if (!sessionActiveTaskId) return

    const unsubscribe = window.api.subscribe(IpcChannel.TaskStream, (payload) => {
      const event = payload as TaskEvent
      if (event.taskId !== sessionActiveTaskId) return
      if (event.type !== 'task.finished' && event.type !== 'task.started') return

      if (event.type === 'task.finished') {
        setBoundTask(null)
        if (event.sessionId === session.activeSessionId) {
          void session.loadSessions()
        }
        return
      }

      void (async () => {
        const result = await window.api.invoke(IpcChannel.TaskGet, { taskId: sessionActiveTaskId })
        if (result.ok && result.data) {
          const task = result.data as AgentTask
          if (isTerminalTaskStatus(task.status)) {
            setBoundTask(null)
            return
          }
          setBoundTask(task)
        } else {
          setBoundTask(null)
        }
      })()
    })

    return unsubscribe
  }, [session, sessionActiveTaskId])

  const groupProxyMode = useMemo(
    () => isGroupProxySession(session.activeSession),
    [session.activeSession],
  )

  const effectiveModelIds = useMemo(() => {
    if (groupProxyMode && activeAssistant) {
      const modelId = resolveGroupProxyAssistantModelId(activeAssistant, session.activeSession)
      return modelId ? [modelId] : selectedModelIds
    }
    return selectedModelIds
  }, [activeAssistant, groupProxyMode, selectedModelIds, session.activeSession])

  const buildSendOptionsForSession = useCallback(
    (contentBlocks?: ContentBlock[]) =>
      buildSendOptions(session, assistants, appSettings, contentBlocks),
    [session, assistants, appSettings],
  )

  const sendMessage = useCallback(
    async (contentBlocks: ContentBlock[], options?: { enableTools?: boolean }) => {
      const text = getBlocksText(contentBlocks)
      const hasImages = contentBlocks.some((block) => block.type === 'image')
      const hasFiles = contentBlocks.some((block) => block.type === 'file')
      if (
        !session.activeSessionId ||
        (!text.trim() && !hasImages && !hasFiles) ||
        effectiveModelIds.length === 0
      ) {
        return
      }

      const ctx: ChatSendContext = {
        session,
        streamingRefs,
        effectiveModelIds,
        messages,
        setMessages,
        setSending,
        setError,
        loadMessages,
        setEditingUserMessageId,
        buildSendOptions: buildSendOptionsForSession,
      }

      if (editingUserMessageId) {
        let editTaskId: string | undefined
        if (autonomousTaskMode) {
          const editingMessage = messages.find((message) => message.id === editingUserMessageId)
          editTaskId = parseMessageTaskId(editingMessage?.metadata)
          if (
            sessionActiveTaskId &&
            boundTask &&
            !isTerminalTaskStatus(boundTask.status)
          ) {
            editTaskId = sessionActiveTaskId
          }
        }
        await sendEditedUserMessage(ctx, editingUserMessageId, contentBlocks, {
          ...buildSendOptionsForSession(contentBlocks),
          ...(editTaskId ? { taskId: editTaskId } : {}),
        })
        return
      }

      setSending(true)
      setError(null)

      const sendAssistant = (() => {
        const assistantId = session.activeSession?.assistantId
        if (assistantId) {
          return assistants.find((assistant) => assistant.id === assistantId) ?? null
        }
        return assistants.find((assistant) => assistant.isPinned) ?? assistants[0] ?? null
      })()

      const sessionId = session.activeSessionId
      let effectiveSessionActiveTaskId = sessionActiveTaskId
      let effectiveBoundTask = boundTask

      if (effectiveSessionActiveTaskId && !effectiveBoundTask) {
        const taskResult = await window.api.invoke(IpcChannel.TaskGet, {
          taskId: effectiveSessionActiveTaskId,
        })
        if (taskResult.ok && taskResult.data) {
          effectiveBoundTask = taskResult.data as AgentTask
        }
      }

      if (!autonomousTaskMode && effectiveSessionActiveTaskId) {
        await window.api.invoke(IpcChannel.TaskReleaseSessionBinding, { sessionId })
        const refreshedSessions = await session.loadSessions()
        const refreshedSession = refreshedSessions.find((item) => item.id === sessionId)
        effectiveSessionActiveTaskId = parseSessionActiveTaskId(refreshedSession?.metadata)
        effectiveBoundTask = null
      }

      if (autonomousTaskMode && effectiveSessionActiveTaskId && !effectiveBoundTask) {
        await window.api.invoke(IpcChannel.TaskReleaseSessionBinding, { sessionId })
        const refreshedSessions = await session.loadSessions()
        const refreshedSession = refreshedSessions.find((item) => item.id === sessionId)
        effectiveSessionActiveTaskId = parseSessionActiveTaskId(refreshedSession?.metadata)
        effectiveBoundTask = null
      }

      let taskId = resolveOutboundTaskId({
        autonomousTaskMode,
        sessionActiveTaskId: effectiveSessionActiveTaskId,
        boundTask: effectiveBoundTask,
      })
      let createdTask: AgentTask | null = null
      if (autonomousTaskMode && !taskId) {
        const workspaceId = session.activeSession?.workspaceId
        const assistantId = sendAssistant?.id
        if (!workspaceId || !sessionId || !assistantId) {
          setError('无法创建长任务：缺少工作区、话题或智能体')
          setSending(false)
          return
        }

        if (!sendAssistant?.parameters.longTaskMode) {
          setError('请先在智能体设置 → 权限模式中启用「长任务模式」')
          setSending(false)
          return
        }

        const assistantWorkingDirectory = sendAssistant?.parameters.workingDirectory?.trim()
        let workspaceFolderPath = ''
        if (!assistantWorkingDirectory) {
          const workspaceResult = await window.api.invoke(IpcChannel.WorkspaceGet, { id: workspaceId })
          if (workspaceResult.ok && workspaceResult.data) {
            const folderPath = (workspaceResult.data as Workspace).settings?.folderPath
            workspaceFolderPath = typeof folderPath === 'string' ? folderPath.trim() : ''
          }
        }
        if (!assistantWorkingDirectory && !workspaceFolderPath) {
          setError('无法创建长任务：请先在智能体或工作区设置中指定工作目录')
          setSending(false)
          return
        }

        const title = text.trim().slice(0, 80) || '长任务'
        const createResult = await window.api.invoke(IpcChannel.TaskCreate, {
          workspaceId,
          assistantId,
          sessionId,
          title,
          goal: text.trim() || title,
        })
        if (!createResult.ok) {
          setError(createResult.error.message)
          setSending(false)
          return
        }
        createdTask = createResult.data as AgentTask
        taskId = createdTask.id
        setBoundTask(createdTask)
        await session.loadSessions()
        window.dispatchEvent(
          new CustomEvent('toolman:agent-task-created', {
            detail: { taskId, task: createdTask },
          }),
        )
      }

      const mcpServerIds = getAssistantMcpServerIds(sendAssistant)
      const skillIds = getAssistantSkillIds(sendAssistant)
      const enableTools = resolveChatEnableTools(
        mcpServerIds,
        skillIds,
        contentBlocks,
        autonomousTaskMode ? true : options?.enableTools,
      )

      const baseOptions = buildSendOptionsForSession(contentBlocks)
      await sendNewUserMessage(ctx, contentBlocks, {
        ...baseOptions,
        enableTools,
        kbIds: sendAssistant?.parameters.kbIds ?? baseOptions.kbIds,
        taskId,
      })

      if (autonomousTaskMode && taskId && !createdTask) {
        const taskResult = await window.api.invoke(IpcChannel.TaskGet, { taskId })
        if (taskResult.ok && taskResult.data) {
          const updatedTask = taskResult.data as AgentTask
          setBoundTask(updatedTask)
          window.dispatchEvent(
            new CustomEvent('toolman:agent-task-updated', { detail: { taskId, task: updatedTask } }),
          )
        }
      }
    },
    [
      session,
      effectiveModelIds,
      sessionActiveTaskId,
      autonomousTaskMode,
      boundTask,
      assistants,
      messages,
      buildSendOptionsForSession,
      loadMessages,
      editingUserMessageId,
      setEditingUserMessageId,
      setError,
      setMessages,
      streamingRefs,
    ],
  )

  const abortStreaming = useCallback(async () => {
    if (!session.activeSessionId) return

    streamingIds.current.clear()
    setSending(false)

    await window.api.invoke(IpcChannel.MessageAbortSession, {
      sessionId: session.activeSessionId,
    })
  }, [session.activeSessionId, streamingIds])

  const toggleAutonomousTask = useCallback(async () => {
    const sessionId = session.activeSessionId
    if (!sessionId) return

    if (!longTaskEnabled) {
      setError('请先在智能体设置 → 权限模式中启用「长任务模式」')
      return
    }

    const runningBound =
      boundTask &&
      sessionActiveTaskId &&
      sessionActiveTaskId === boundTask.id &&
      !isTerminalTaskStatus(boundTask.status)
        ? boundTask
        : null

    if (!runningBound) {
      return
    }

    const result = await window.api.invoke(IpcChannel.TaskControl, {
      taskId: runningBound.id,
      action: 'cancel',
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setBoundTask((result.data as { task: AgentTask }).task)
    await window.api.invoke(IpcChannel.TaskReleaseSessionBinding, { sessionId })
    await session.loadSessions()
    setBoundTask(null)
  }, [boundTask, longTaskEnabled, session, sessionActiveTaskId, setError])

  return {
    sending,
    setSending,
    sendMessage,
    abortStreaming,
    buildSendOptionsForSession,
    activeAssistant,
    groupProxyMode,
    effectiveModelIds,
    autonomousTaskMode,
    setAutonomousTaskMode,
    toggleAutonomousTask,
    taskModeActive,
    longTaskEnabled,
    sessionActiveTaskId,
    sessionTaskBindingLocked,
    boundTask,
  }
}
