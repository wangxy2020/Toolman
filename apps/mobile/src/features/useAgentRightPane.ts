import { useEffect, useMemo, useRef, useState } from 'react'
import type { ScrollView } from 'react-native'
import { stripSocraticMachineBlocks } from '@toolman/shared'
import { resolveAgentChatScope, type AgentChatScope } from '../chat/agentScopes'
import { useMobileApp, type ChatMessage, type ChatSession } from '../state/MobileAppContext'
import { copyToClipboard } from '../utils/clipboard'
import { classroomCourseIsLive } from './classroomClassSession'
import { resolveClassroomSidebarFocus } from './classroomSidebar'
import {
  classroomStatusFromSync,
  createEmptyAgentSession,
  createNoteFromMessage,
  defaultComposerToolbar,
  eventPoint,
  forkSessionFromMessage,
  messageIdsToDelete,
  type ComposerToolbarState,
} from './agentPaneUtils'
import {
  ensureAgentRightPaneSession,
  toggleAgentRightPaneClass,
} from './useAgentRightPaneClassroom'
import { useAgentRightPaneSelection } from './useAgentRightPaneSelection'
import { sendAgentRightPaneMessage } from './useAgentRightPaneSend'
import {
  createAgentRightPaneStream,
  regenerateAssistantMessage,
} from './useAgentRightPaneStream'
import { useAgentRightPaneTranslate } from './useAgentRightPaneTranslate'
import { useAgentRightPaneTts } from './useAgentRightPaneTts'

export function useAgentRightPane() {
  const {
    module,
    sessions,
    agents,
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
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [userMenu, setUserMenu] = useState<{ msg: ChatMessage; x: number; y: number } | null>(null)
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

  const tts = useAgentRightPaneTts(modulePrefs)
  const selection = useAgentRightPaneSelection()
  const translate = useAgentRightPaneTranslate({ modelConfig, modulePrefs, setError })

  const scrollStreamToEnd = (animated = false) => {
    requestAnimationFrame(() => {
      streamScrollRef.current?.scrollToEnd({ animated })
    })
  }

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    tts.stopTts()
    selection.resetSelection()
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

  const ensureSession = (): ChatSession | null =>
    ensureAgentRightPaneSession({
      activeSessionId,
      scopedSessions,
      agentScope,
      agents,
      upsertSession,
    })

  const { runCompletion, runGroupAgentRelay } = createAgentRightPaneStream({
    modelConfig,
    modulePrefs,
    agentScope,
    useDesktopHost,
    desktopHostsOnline,
    upsertSession,
    setBusy,
    setError,
    autoSpeakReply: tts.autoSpeakReply,
    abortRef,
  })

  const send = async (presetText?: string) => {
    await sendAgentRightPaneMessage({
      text: (presetText ?? input).trim(),
      busy,
      ensureSession,
      upsertSession,
      setInput,
      setBusy,
      setError,
      clearInput: !presetText,
      runGroupAgentRelay,
      runCompletion,
    })
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
      tts.setActionHint('已复制')
      setTimeout(() => {
        setCopiedId((id) => (id === msg.id ? null : id))
        tts.setActionHint(null)
      }, 1500)
    } else {
      tts.setActionHint('复制失败')
    }
  }

  const editUserMessage = (msg: ChatMessage) => {
    if (busy || msg.role !== 'user' || !session) return
    setInput(msg.content)
    deleteMessage(msg.id)
  }

  const regenerateAssistant = async (assistantId: string) => {
    if (!session) return
    await regenerateAssistantMessage({
      session,
      busy,
      assistantId,
      upsertSession,
      setBusy,
      setError,
      clearTranslationsFrom: translate.clearTranslationsFrom,
      runCompletion,
    })
  }

  const forkFromMessage = (messageId: string) => {
    if (!session || busy) return
    const forked = forkSessionFromMessage(session, messageId, agentScope)
    if (!forked) return
    upsertSession(forked)
    setActiveSessionId(forked.id)
    tts.setActionHint('已从此处分叉为新会话')
    setTimeout(() => tts.setActionHint(null), 1500)
  }

  const saveToNote = (msg: ChatMessage) => {
    const body = stripSocraticMachineBlocks(msg.content)
    if (!body) return
    const notebookId =
      notebooks.find((item) => item.isDefault)?.id ?? notebooks[0]?.id ?? 'notebook-default'
    setNotes([createNoteFromMessage(body, notebookId), ...notes])
    tts.setActionHint('已保存到笔记')
    setTimeout(() => tts.setActionHint(null), 1500)
  }

  const toggleClass = () => {
    toggleAgentRightPaneClass({
      classroomCourse,
      classLive,
      busy,
      classroomCourses,
      setClassroomCourses,
      abort: () => abortRef.current?.abort(),
      send: (text) => {
        void send(text)
      },
    })
  }

  const startNewTopic = () => {
    // Group-proxy topics are opened from the group shared-agents pane; do not
    // invent a personal topic under an arbitrary local assistant from here.
    if (session?.groupAgent) return
    const assistantId =
      session?.assistantId ??
      agents.find((agent) => agent.agentScope === agentScope)?.id
    if (!assistantId) return
    const created = createEmptyAgentSession(agentScope, assistantId)
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
  ) => setUserMenu({ msg, ...eventPoint(event) })

  return {
    agentScope, session, input, setInput, busy, error, setError,
    actionHint: tts.actionHint, copiedId, userMenu, setUserMenu,
    selectionMode: selection.selectionMode, selectedIds: selection.selectedIds,
    translations: translate.translations,
    visibleTranslationIds: translate.visibleTranslationIds,
    translatingIds: translate.translatingIds,
    speakingId: tts.speakingId, setSpeakingId: tts.setSpeakingId, ttsState: tts.ttsState,
    webSearchEnabled, kbEnabled, useDesktopHost, patchToolbar, abortRef, streamScrollRef,
    scrollStreamToEnd, classroomCourse, classLive, classroomStatus, send, deleteMessage,
    copyMessage, editUserMessage,
    enterMessageSelection: selection.enterMessageSelection,
    toggleMessageSelected: selection.toggleMessageSelected,
    selectAllMessages: () => selection.selectAllMessages(session),
    clearUserMessageSelection: selection.clearUserMessageSelection,
    regenerateAssistant, forkFromMessage, translateMessage: translate.translateMessage,
    speakMessage: tts.speakMessage, saveToNote, toggleClass, startNewTopic, openUserMenu,
    groupAgentReadOnly: session?.groupAgent?.permission === 'read',
  }
}
