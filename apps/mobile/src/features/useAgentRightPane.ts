import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScrollView } from 'react-native'
import { stripSocraticMachineBlocks } from '@toolman/shared'
import { streamChatCompletion } from '../chat/streamChat'
import { translateWithChatModel } from '../chat/translateWithModel'
import { invokeDesktopAgent } from '../host/invokeDesktop'
import { createReachableMobileSyncClient } from '../sync/mobileSync'
import { resolveAgentChatScope, type AgentChatScope } from '../chat/agentScopes'
import { useMobileApp, type ChatMessage, type ChatSession } from '../state/MobileAppContext'
import { copyToClipboard } from '../utils/clipboard'
import { getMobileTtsController, unlockAudioPlayback, type TtsPlaybackState } from '../voice'
import {
  classroomCourseIsLive,
  startClassroomSession,
  stopClassroomSession,
  withUpdatedStudyRecords,
} from './classroomClassSession'
import { resolveClassroomSidebarFocus } from './classroomSidebar'
import {
  buildAgentSystemPrompt,
  classroomStatusFromSync,
  createEmptyAgentSession,
  createNoteFromMessage,
  defaultComposerToolbar,
  eventPoint,
  forkSessionFromMessage,
  messageIdsToDelete,
  newAgentId,
  type ComposerToolbarState,
  type MessageTranslation,
} from './agentPaneUtils'

export function useAgentRightPane() {
  const {
    module,
    sessions,
    activeSessionId,
    setActiveSessionId,
    upsertSession,
    modelConfig,
    desktopHostsOnline,
    modulePrefs,
    setNotes,
    notes,
    notebooks,
    classroomCourses,
    setClassroomCourses,
    syncStatus,
  } = useMobileApp()
  const agentScope = resolveAgentChatScope(module)
  const courseIds = new Set(classroomCourses.map((course) => course.id))
  const scopedSessions =
    agentScope === 'classroom'
      ? sessions.filter((item) => item.agentScope === 'classroom' && courseIds.has(item.id))
      : sessions.filter((item) => item.agentScope === agentScope)
  const session =
    scopedSessions.find((item) => item.id === activeSessionId) ?? scopedSessions[0] ?? null
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionHint, setActionHint] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [userMenu, setUserMenu] = useState<{ msg: ChatMessage; x: number; y: number } | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({})
  const [visibleTranslationIds, setVisibleTranslationIds] = useState<Record<string, boolean>>({})
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({})
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [ttsState, setTtsState] = useState<TtsPlaybackState>('idle')
  const [toolbarByScope, setToolbarByScope] = useState<
    Partial<Record<AgentChatScope, ComposerToolbarState>>
  >({})
  const toolbar =
    toolbarByScope[agentScope] ?? defaultComposerToolbar(agentScope, modulePrefs)
  const { webSearchEnabled, kbEnabled, useDesktopHost } = toolbar
  const patchToolbar = (patch: Partial<ComposerToolbarState>) => {
    setToolbarByScope((prev) => ({
      ...prev,
      [agentScope]: {
        ...(prev[agentScope] ?? defaultComposerToolbar(agentScope, modulePrefs)),
        ...patch,
      },
    }))
  }
  const abortRef = useRef<AbortController | null>(null)
  const streamScrollRef = useRef<ScrollView>(null)

  const scrollStreamToEnd = (animated = false) => {
    requestAnimationFrame(() => {
      streamScrollRef.current?.scrollToEnd({ animated })
    })
  }

  useEffect(() => {
    getMobileTtsController().configure({
      engine: modulePrefs.agent.ttsEngine,
      voice: modulePrefs.agent.ttsVoice,
    })
  }, [modulePrefs.agent.ttsEngine, modulePrefs.agent.ttsVoice])

  useEffect(() => {
    return getMobileTtsController().subscribe((state) => {
      setTtsState(state.playbackState)
      setSpeakingId(state.playingMessageId)
      if (state.fellBack && state.lastError) {
        setActionHint(`Edge 语音不可用，已回退系统语音（${state.lastError}）`)
      } else if (state.lastError && state.playbackState === 'idle') {
        setActionHint(state.lastError)
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      getMobileTtsController().stop()
    }
  }, [])

  useEffect(() => {
    getMobileTtsController().stop()
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [activeSessionId])

  const classroomCourse =
    agentScope === 'classroom'
      ? classroomCourses.find((course) => course.id === session?.id) ?? null
      : null
  const classLive = classroomCourseIsLive(classroomCourse)
  const classroomStatus = useMemo(
    () => classroomStatusFromSync(agentScope, syncStatus),
    [agentScope, syncStatus],
  )

  useEffect(() => {
    if (activeSessionId && scopedSessions.some((item) => item.id === activeSessionId)) return
    const nextId =
      agentScope === 'classroom'
        ? resolveClassroomSidebarFocus(classroomCourses, activeSessionId)?.courseId ??
          scopedSessions[0]?.id ??
          null
        : scopedSessions[0]?.id ?? null
    if (nextId !== activeSessionId) setActiveSessionId(nextId)
  }, [agentScope, activeSessionId, classroomCourses, sessions, setActiveSessionId])

  const lastMessage = session?.messages[session.messages.length - 1]
  useEffect(() => {
    scrollStreamToEnd(false)
  }, [session?.id, session?.messages.length, lastMessage?.content, busy])

  const ensureSession = (): ChatSession | null => {
    if (activeSessionId) {
      const existing = scopedSessions.find((item) => item.id === activeSessionId)
      if (existing) return existing
    }
    if (scopedSessions[0]) return scopedSessions[0]
    if (agentScope === 'classroom') return null
    const created = createEmptyAgentSession(agentScope)
    upsertSession(created)
    return created
  }

  const autoSpeakReply = (messageId: string, content: string) => {
    if (!modulePrefs.agent.autoSpeak) return
    if (!content.trim()) return
    const tts = getMobileTtsController()
    tts.configure({
      engine: modulePrefs.agent.ttsEngine,
      voice: modulePrefs.agent.ttsVoice,
    })
    tts.speakMessage(messageId, content)
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
      if (final?.content.trim()) autoSpeakReply(final.id, final.content)
    }

    const controller = new AbortController()
    abortRef.current = controller
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      finish()
    }

    const prompt = buildAgentSystemPrompt(modulePrefs)
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

  const send = async (presetText?: string) => {
    const text = (presetText ?? input).trim()
    if (!text || busy) return
    unlockAudioPlayback()
    const base = ensureSession()
    if (!base) {
      setError('请先在侧栏选择一门课程')
      return
    }
    if (!presetText) setInput('')
    setError(null)
    setBusy(true)

    const userMsg: ChatMessage = {
      id: newAgentId('msg'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    const assistantMsg: ChatMessage = {
      id: newAgentId('msg'),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    }
    const next: ChatSession = {
      ...base,
      title: base.messages.length === 0 ? text.slice(0, 24) : base.title,
      updatedAt: Date.now(),
      messages: [...base.messages, userMsg, assistantMsg],
    }
    upsertSession(next)

    await runCompletion(
      next,
      [
        ...base.messages.map((msg) => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: text },
      ],
      text,
      assistantMsg,
    )
  }

  const deleteMessage = (messageId: string) => {
    if (!session || busy) return
    const removeIds = messageIdsToDelete(session.messages, messageId)
    upsertSession({
      ...session,
      updatedAt: Date.now(),
      messages: session.messages.filter((m) => !removeIds.has(m.id)),
    })
  }

  const copyMessage = async (msg: ChatMessage) => {
    const ok = await copyToClipboard(msg.content)
    if (ok) {
      setCopiedId(msg.id)
      setActionHint('已复制')
      setTimeout(() => {
        setCopiedId((id) => (id === msg.id ? null : id))
        setActionHint(null)
      }, 1500)
    } else {
      setActionHint('复制失败')
    }
  }

  const editUserMessage = (msg: ChatMessage) => {
    if (busy || msg.role !== 'user' || !session) return
    setInput(msg.content)
    deleteMessage(msg.id)
  }

  const enterMessageSelection = (messageId: string) => {
    setSelectionMode(true)
    setSelectedIds(new Set([messageId]))
  }

  const toggleMessageSelected = (messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  const selectAllMessages = () => {
    if (!session) return
    setSelectionMode(true)
    setSelectedIds(new Set(session.messages.map((item) => item.id)))
  }

  const clearUserMessageSelection = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const regenerateAssistant = async (assistantId: string) => {
    if (!session || busy) return
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
    setTranslations((prev) => {
      const copy = { ...prev }
      for (const msg of session.messages.slice(idx)) delete copy[msg.id]
      return copy
    })

    await runCompletion(
      next,
      prior.map((m) => ({ role: m.role, content: m.content })),
      userMsg.content,
      cleared,
    )
  }

  const forkFromMessage = (messageId: string) => {
    if (!session || busy) return
    const forked = forkSessionFromMessage(session, messageId, agentScope)
    if (!forked) return
    upsertSession(forked)
    setActiveSessionId(forked.id)
    setActionHint('已从此处分叉为新会话')
    setTimeout(() => setActionHint(null), 1500)
  }

  const translateMessage = async (msg: ChatMessage) => {
    if (msg.role !== 'assistant' || !msg.content.trim()) return
    const existing = translations[msg.id]
    if (existing && visibleTranslationIds[msg.id]) {
      setVisibleTranslationIds((prev) => ({ ...prev, [msg.id]: false }))
      return
    }
    if (existing) {
      setVisibleTranslationIds((prev) => ({ ...prev, [msg.id]: true }))
      return
    }

    const targetLanguage = modulePrefs.translate.targetLang || 'zh-CN'
    setTranslatingIds((prev) => ({ ...prev, [msg.id]: true }))
    setError(null)
    const result = await translateWithChatModel({
      config: modelConfig,
      text: msg.content,
      targetLang: targetLanguage,
    })
    setTranslatingIds((prev) => ({ ...prev, [msg.id]: false }))
    if (!result.ok) {
      setError(result.message)
      return
    }
    setTranslations((prev) => ({
      ...prev,
      [msg.id]: { text: result.text, targetLanguage },
    }))
    setVisibleTranslationIds((prev) => ({ ...prev, [msg.id]: true }))
  }

  const speakMessage = (msg: ChatMessage) => {
    unlockAudioPlayback()
    const tts = getMobileTtsController()
    tts.configure({
      engine: modulePrefs.agent.ttsEngine,
      voice: modulePrefs.agent.ttsVoice,
    })
    tts.speakMessage(msg.id, msg.content)
  }

  const saveToNote = (msg: ChatMessage) => {
    const body = stripSocraticMachineBlocks(msg.content)
    if (!body) return
    const notebookId =
      notebooks.find((item) => item.isDefault)?.id ?? notebooks[0]?.id ?? 'notebook-default'
    setNotes([createNoteFromMessage(body, notebookId), ...notes])
    setActionHint('已保存到笔记')
    setTimeout(() => setActionHint(null), 1500)
  }

  const toggleClass = () => {
    if (!classroomCourse) return
    if (classLive) {
      if (busy) abortRef.current?.abort()
      setClassroomCourses(
        withUpdatedStudyRecords(
          classroomCourses,
          classroomCourse.id,
          stopClassroomSession(classroomCourse),
        ),
      )
      return
    }
    if (busy) return
    const started = startClassroomSession(classroomCourse)
    setClassroomCourses(
      withUpdatedStudyRecords(
        classroomCourses,
        classroomCourse.id,
        started.studyRecords,
      ),
    )
    void send(started.userMessage)
  }

  const startNewTopic = () => {
    const created = createEmptyAgentSession(agentScope)
    upsertSession(created)
    setActiveSessionId(created.id)
    setInput('')
    setError(null)
  }

  const openUserMenu = (
    msg: ChatMessage,
    event: {
      nativeEvent?: { pageX?: number; pageY?: number }
      pageX?: number
      pageY?: number
    },
  ) => {
    setUserMenu({ msg, ...eventPoint(event) })
  }

  return {
    agentScope,
    session,
    input,
    setInput,
    busy,
    error,
    actionHint,
    copiedId,
    userMenu,
    setUserMenu,
    selectionMode,
    selectedIds,
    translations,
    visibleTranslationIds,
    translatingIds,
    speakingId,
    setSpeakingId,
    ttsState,
    webSearchEnabled,
    kbEnabled,
    useDesktopHost,
    patchToolbar,
    abortRef,
    streamScrollRef,
    scrollStreamToEnd,
    classroomCourse,
    classLive,
    classroomStatus,
    send,
    deleteMessage,
    copyMessage,
    editUserMessage,
    enterMessageSelection,
    toggleMessageSelected,
    selectAllMessages,
    clearUserMessageSelection,
    regenerateAssistant,
    forkFromMessage,
    translateMessage,
    speakMessage,
    saveToNote,
    toggleClass,
    startNewTopic,
    openUserMenu,
  }
}
