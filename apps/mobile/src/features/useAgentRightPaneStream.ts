import type { AgentChatScope } from '../chat/agentScopes'
import { streamChatCompletion } from '../chat/streamChat'
import { invokeDesktopAgent } from '../host/invokeDesktop'
import { sendGroupAgentRelay } from '../p2p/agentRelay'
import type { ModulePrefs } from '../settings/prefs'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import { createReachableMobileSyncClient } from '../sync/mobileSync'
import { unlockAudioPlayback } from '../voice'
import type { ChatMessage, ChatSession, ModelConfig } from '../state/MobileAppContext'
import { buildAgentSystemPrompt } from './agentPaneUtils'
import { applyClassroomProgressFromAssistantReply } from './classroomProgressFromReply'

export function createAgentRightPaneStream(deps: {
  modelConfig: ModelConfig
  modulePrefs: ModulePrefs
  agentScope: AgentChatScope
  useDesktopHost: boolean
  desktopHostsOnline: number
  classroomCourseRef: { current: MobileClassroomCourse | null }
  classroomCoursesRef: { current: MobileClassroomCourse[] }
  setClassroomCourses: (courses: MobileClassroomCourse[]) => void
  upsertSession: (session: ChatSession) => void
  setBusy: (busy: boolean) => void
  setError: (message: string | null) => void
  autoSpeakReply: (messageId: string, content: string) => void
  abortRef: { current: AbortController | null }
}) {
  const {
    modelConfig,
    modulePrefs,
    agentScope,
    useDesktopHost,
    desktopHostsOnline,
    classroomCourseRef,
    classroomCoursesRef,
    setClassroomCourses,
    upsertSession,
    setBusy,
    setError,
    autoSpeakReply,
    abortRef,
  } = deps

  const persistClassroomProgress = (session: ChatSession, assistantText: string) => {
    if (agentScope !== 'classroom') return
    const courseId = session.id
    const current =
      classroomCoursesRef.current.find((item) => item.id === courseId) ??
      classroomCourseRef.current
    if (!current || current.id !== courseId) return
    const userMessageCount = session.messages.filter((msg) => msg.role === 'user').length
    const nextCourse = applyClassroomProgressFromAssistantReply({
      course: current,
      assistantText,
      userMessageCount,
    })
    if (!nextCourse) return
    setClassroomCourses(
      classroomCoursesRef.current.map((item) => (item.id === nextCourse.id ? nextCourse : item)),
    )
  }

  const runCompletion = async (
    base: ChatSession,
    historyForApi: Array<{ role: ChatMessage['role']; content: string }>,
    userText: string,
    assistantMsg: ChatMessage,
  ) => {
    let next = base
    let receivedDelta = false
    const appendDelta = (delta: string) => {
      receivedDelta = true
      const messages = next.messages.map((msg) =>
        msg.id === assistantMsg.id ? { ...msg, content: msg.content + delta } : msg,
      )
      next = { ...next, messages, updatedAt: Date.now() }
      upsertSession(next)
    }

    const finish = () => {
      setBusy(false)
      const final = next.messages.find((msg) => msg.id === assistantMsg.id)
      if (final?.content.trim()) {
        autoSpeakReply(final.id, final.content)
        persistClassroomProgress(next, final.content)
      }
    }

    const controller = new AbortController()
    abortRef.current = controller
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      finish()
    }

    const prompt = buildAgentSystemPrompt(modulePrefs, {
      classroomCourse: agentScope === 'classroom' ? classroomCourseRef.current : null,
    })
    await streamChatCompletion({
      config: modelConfig,
      messages: prompt
        ? [{ role: 'system', content: prompt }, ...historyForApi]
        : historyForApi,
      signal: controller.signal,
      handlers: {
        onDelta: appendDelta,
        onDone: () => settle(),
        onError: (message) => {
          if (!controller.signal.aborted) setError(message)
          setBusy(false)
          settled = true
        },
      },
    })

    if (
      !receivedDelta &&
      !controller.signal.aborted &&
      useDesktopHost &&
      desktopHostsOnline > 0
    ) {
      try {
        const client = await createReachableMobileSyncClient()
        const hosts = await client.listHosts()
        const host = hosts.find((item) => item.agentHost && item.deviceKind === 'desktop')
        if (host) {
          const hostCapability =
            agentScope === 'classroom'
              ? 'classroom'
              : agentScope === 'projects'
                ? 'project-management'
                : 'agent'
          await invokeDesktopAgent({
            hostDeviceId: host.deviceId,
            capability: hostCapability,
            message: userText,
            onDelta: appendDelta,
            onError: (message) => setError(message),
          })
        }
      } catch (err) {
        if (!receivedDelta) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    settle()
  }

  const runGroupAgentRelay = async (
    base: ChatSession,
    userText: string,
    assistantMsg: ChatMessage,
    userMsg: ChatMessage,
  ) => {
    const proxy = base.groupAgent
    if (!proxy) return
    let next = base
    const appendDelta = (delta: string, replace?: boolean) => {
      const messages = next.messages.map((msg) =>
        msg.id === assistantMsg.id
          ? { ...msg, content: replace ? delta : msg.content + delta }
          : msg,
      )
      next = { ...next, messages, updatedAt: Date.now() }
      upsertSession(next)
    }
    try {
      await sendGroupAgentRelay({
        workspaceId: proxy.workspaceId,
        resourceId: proxy.resourceId,
        sourceSessionId: proxy.sourceSessionId,
        memberSessionId: base.id,
        memberUserMessageId: userMsg.id,
        memberAssistantMessageId: assistantMsg.id,
        text: userText,
        onDelta: appendDelta,
        ownerDeviceId: proxy.ownerDeviceId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      const final = next.messages.find((msg) => msg.id === assistantMsg.id)
      if (final?.content.trim()) autoSpeakReply(final.id, final.content)
    }
  }

  return { runCompletion, runGroupAgentRelay }
}

export async function regenerateAssistantMessage(input: {
  session: ChatSession
  busy: boolean
  assistantId: string
  upsertSession: (session: ChatSession) => void
  setBusy: (busy: boolean) => void
  setError: (message: string | null) => void
  clearTranslationsFrom: (messages: ChatMessage[], fromIdx: number) => void
  runCompletion: (
    base: ChatSession,
    historyForApi: Array<{ role: ChatMessage['role']; content: string }>,
    userText: string,
    assistantMsg: ChatMessage,
  ) => Promise<void>
}) {
  const {
    session,
    busy,
    assistantId,
    upsertSession,
    setBusy,
    setError,
    clearTranslationsFrom,
    runCompletion,
  } = input
  if (busy) return
  const idx = session.messages.findIndex((m) => m.id === assistantId)
  if (idx < 0) return
  const assistant = session.messages[idx]!
  if (assistant.role !== 'assistant') return
  let userIdx = idx - 1
  while (userIdx >= 0 && session.messages[userIdx]?.role !== 'user') userIdx -= 1
  const userMsg = userIdx >= 0 ? session.messages[userIdx]! : null
  if (!userMsg) {
    setError('无法重新生成：缺少对应用户消息')
    return
  }

  setError(null)
  setBusy(true)
  unlockAudioPlayback()
  const cleared: ChatMessage = { ...assistant, content: '', createdAt: Date.now() }
  const prior = session.messages.slice(0, idx)
  const next: ChatSession = {
    ...session,
    updatedAt: Date.now(),
    messages: [...prior, cleared],
  }
  upsertSession(next)
  clearTranslationsFrom(session.messages, idx)

  await runCompletion(
    next,
    prior.map((m) => ({ role: m.role, content: m.content })),
    userMsg.content,
    cleared,
  )
}
