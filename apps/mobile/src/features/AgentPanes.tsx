import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import { stripSocraticMachineBlocks } from '@toolman/shared'
import { streamChatCompletion } from '../chat/streamChat'
import { translateWithChatModel } from '../chat/translateWithModel'
import { invokeDesktopAgent } from '../host/invokeDesktop'
import {
  IconCopy,
  IconGitFork,
  IconPause,
  IconPlay,
  IconRefresh,
  IconSaveNote,
  IconSpeaker,
  IconStop,
  IconTranslate,
  IconTrashMsg,
} from '../icons/composer-icons'
import { createReachableMobileSyncClient } from '../sync/mobileSync'
import { resolveAgentChatScope, type AgentChatScope } from '../chat/agentScopes'
import { useMobileApp, type ChatMessage, type ChatSession } from '../state/MobileAppContext'
import type { ModulePrefs } from '../settings/prefs'
import { colors, shellStyles } from '../theme'
import { copyToClipboard } from '../utils/clipboard'
import { getMobileTtsController, unlockAudioPlayback, type TtsPlaybackState } from '../voice'
import { useSidebarLayout } from '../layout'
import { ChatComposer } from './ChatComposer'
import { ChatMessageContextMenu } from './ChatMessageContextMenu'
import { MessageMarkdown } from './MessageMarkdown'
import { ThinkingHeartbeat } from './ThinkingHeartbeat'
import {
  SidebarAddButton,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'
import { SwipeableTopicRow } from './SwipeableTopicRow'

/** Match composer / message stream horizontal inset (12 + 8 scrollbar gutter). */
const STREAM_PAD_SIDE = 20

type MessageTranslation = { text: string; targetLanguage: string }

type ComposerToolbarState = {
  webSearchEnabled: boolean
  kbEnabled: boolean
  useDesktopHost: boolean
}

function defaultComposerToolbar(
  scope: AgentChatScope,
  prefs: ModulePrefs,
): ComposerToolbarState {
  return {
    webSearchEnabled: prefs.agent.defaultWebSearch,
    kbEnabled: scope === 'classroom' ? true : prefs.agent.defaultKb,
    useDesktopHost:
      scope === 'classroom'
        ? prefs.classroom.preferDesktopHost
        : scope === 'projects'
          ? prefs.projects.preferDesktopHost
          : prefs.agent.preferDesktopHost,
  }
}

/** Match desktop `formatMessageTime`: `MM/DD HH:mm`. */
function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function eventPoint(event: {
  nativeEvent?: { pageX?: number; pageY?: number }
  pageX?: number
  pageY?: number
}): { x: number; y: number } {
  const native = event.nativeEvent
  return {
    x: native?.pageX ?? event.pageX ?? 24,
    y: native?.pageY ?? event.pageY ?? 96,
  }
}

export function AgentLeftPane() {
  const {
    module,
    sessions,
    activeSessionId,
    setActiveSessionId,
    upsertSession,
    renameSession,
    removeSession,
    setLeftOpen,
  } = useMobileApp()
  const agentScope = resolveAgentChatScope(module)
  const scopedSessions = sessions.filter((item) => item.agentScope === agentScope)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const layout = useSidebarLayout()

  const createSession = () => {
    const session: ChatSession = {
      id: newId('sess'),
      title: '新话题',
      updatedAt: Date.now(),
      messages: [],
      agentScope,
    }
    upsertSession(session)
    setActiveSessionId(session.id)
    setRenamingId(null)
    setOpenSwipeId(null)
    setLeftOpen(false)
  }

  const commitRename = (sessionId: string) => {
    const next = draftTitle.trim()
    if (next) {
      renameSession(sessionId, next)
    }
    setRenamingId(null)
    setDraftTitle('')
  }

  const confirmDelete = (session: ChatSession) => {
    const message = `确定删除「${session.title}」？此操作不可恢复。`
    const doDelete = () => {
      if (renamingId === session.id) {
        setRenamingId(null)
        setDraftTitle('')
      }
      setOpenSwipeId(null)
      removeSession(session.id)
    }

    if (Platform.OS === 'web') {
      if (typeof globalThis.confirm === 'function' && globalThis.confirm(message)) {
        doDelete()
      }
      return
    }

    Alert.alert('删除话题', message, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: doDelete },
    ])
  }

  return (
    <SidebarShell>
      <SidebarAddButton label="新建话题" onPress={createSession} />
      <SidebarList>
        {scopedSessions.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无话题</Text>
        ) : (
          scopedSessions.map((session) => {
            const active = activeSessionId === session.id
            const renaming = renamingId === session.id
            if (renaming) {
              return (
                <View
                  key={session.id}
                  style={[
                    topicStyles.renameWrap,
                    { minHeight: layout.rowMinHeight },
                    active ? topicStyles.renameWrapActive : null,
                  ]}
                >
                  <TextInput
                    style={[topicStyles.renameInput, { fontSize: layout.topicFontSize }]}
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                    onSubmitEditing={() => commitRename(session.id)}
                    onBlur={() => commitRename(session.id)}
                    placeholder="话题名称"
                    placeholderTextColor={colors.textSecondary}
                    underlineColorAndroid="transparent"
                  />
                </View>
              )
            }
            return (
              <SwipeableTopicRow
                key={session.id}
                active={active}
                open={openSwipeId === session.id}
                onOpenChange={(open) => setOpenSwipeId(open ? session.id : null)}
                onPress={() => {
                  setOpenSwipeId(null)
                  setActiveSessionId(session.id)
                  setLeftOpen(false)
                }}
                onRename={() => {
                  setOpenSwipeId(null)
                  setActiveSessionId(session.id)
                  setRenamingId(session.id)
                  setDraftTitle(session.title)
                }}
                onDelete={() => confirmDelete(session)}
                renameA11yLabel="重命名话题"
                deleteA11yLabel="删除话题"
              >
                <Text
                  style={[
                    sidebarStyles.itemLabel,
                    active ? sidebarStyles.itemLabelActive : null,
                    topicStyles.title,
                    { fontSize: layout.topicFontSize, lineHeight: layout.topicFontSize + 6 },
                  ]}
                  numberOfLines={1}
                >
                  {session.title}
                </Text>
              </SwipeableTopicRow>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

const topicStyles = StyleSheet.create({
  title: {
    fontWeight: '400',
  },
  renameWrap: {
    marginHorizontal: 10,
    marginVertical: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  renameWrapActive: {
    backgroundColor: colors.accentSoft,
  },
  renameInput: {
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    color: colors.text,
  },
})

export function AgentRightPane() {
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
    // Defer until layout commits so streaming growth is included.
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

  // Stop TTS when switching topic within the same agent page.
  useEffect(() => {
    getMobileTtsController().stop()
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [activeSessionId])

  useEffect(() => {
    if (activeSessionId && scopedSessions.some((item) => item.id === activeSessionId)) return
    const nextId = scopedSessions[0]?.id ?? null
    if (nextId !== activeSessionId) setActiveSessionId(nextId)
  }, [agentScope, activeSessionId, sessions, setActiveSessionId])

  // Follow new replies / streaming tokens to the bottom of the stream.
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
    const created: ChatSession = {
      id: newId('sess'),
      title: '新话题',
      updatedAt: Date.now(),
      messages: [],
      agentScope,
    }
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

    // Shared chat model path (all agent pages use the same modelConfig).
    const controller = new AbortController()
    abortRef.current = controller
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      finish()
    }

    await streamChatCompletion({
      config: modelConfig,
      messages: (() => {
        const prompt = [
          modulePrefs.agent.systemPrompt.trim(),
          modulePrefs.app.memoryEnabled
            ? modulePrefs.app.language === 'en'
              ? `Long-term memory is enabled (retention ${modulePrefs.app.memoryRetentionDays} days). Remember the user's preferences and keep replies consistent across sessions.`
              : `长期记忆已启用（保留 ${modulePrefs.app.memoryRetentionDays} 天）。请记住用户跨会话的偏好与约定，并在回复中保持一致。`
            : '',
        ]
          .filter(Boolean)
          .join('\n\n')
        return prompt
          ? [{ role: 'system', content: prompt }, ...historyForApi]
          : historyForApi
      })(),
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

    // Optional desktop-host attempt only when explicitly enabled and API produced nothing.
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

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    // Unlock in the same user gesture so auto-speak can play after the stream ends.
    unlockAudioPlayback()
    const base = ensureSession()
    if (!base) {
      setError('请先在侧栏选择一门课程')
      return
    }
    setInput('')
    setError(null)
    setBusy(true)

    const userMsg: ChatMessage = {
      id: newId('msg'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    const assistantMsg: ChatMessage = {
      id: newId('msg'),
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
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const target = session.messages[idx]!
    const removeIds = new Set([messageId])
    // Desktop-like: deleting a user turn also drops the following assistant reply.
    if (target.role === 'user') {
      const next = session.messages[idx + 1]
      if (next?.role === 'assistant') removeIds.add(next.id)
    }
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
    // Unlock in the same user gesture so auto-speak can play after regenerate.
    unlockAudioPlayback()
    // Align with desktop: drop this reply and everything after it, then regenerate.
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
    const idx = session.messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const forked: ChatSession = {
      id: newId('sess'),
      title: `${session.title} · 分叉`.slice(0, 40),
      updatedAt: Date.now(),
      messages: session.messages.slice(0, idx + 1).map((m) => ({ ...m, id: newId('msg') })),
      agentScope,
    }
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
    // Must run in the click stack so HTMLAudio can play after async Edge fetch.
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
    const note = {
      id: newId('note'),
      notebookId,
      title: body.slice(0, 24) || '来自对话',
      body,
      updatedAt: Date.now(),
    }
    setNotes([note, ...notes])
    setActionHint('已保存到笔记')
    setTimeout(() => setActionHint(null), 1500)
  }

  const renderAssistantActions = (msg: ChatMessage) => {
    const hasText = Boolean(msg.content.trim())
    const speaking = speakingId === msg.id
    const translating = Boolean(translatingIds[msg.id])
    const translationVisible = Boolean(visibleTranslationIds[msg.id])
    const icon = (active?: boolean) => (active ? colors.accent : colors.textSecondary)

    return (
      <View style={styles.actions}>
        {speaking && ttsState === 'playing' ? (
          <>
            <ActionIcon
              label="暂停"
              active
              onPress={() => {
                getMobileTtsController().pause()
              }}
            >
              <IconPause size={15} color={colors.accent} />
            </ActionIcon>
            <ActionIcon
              label="停止"
              active
              onPress={() => {
                getMobileTtsController().stop()
                setSpeakingId(null)
              }}
            >
              <IconStop size={15} color={colors.accent} />
            </ActionIcon>
          </>
        ) : speaking && ttsState === 'paused' ? (
          <>
            <ActionIcon
              label="继续播放"
              active
              onPress={() => {
                getMobileTtsController().resume()
              }}
            >
              <IconPlay size={15} color={colors.accent} />
            </ActionIcon>
            <ActionIcon
              label="停止"
              active
              onPress={() => {
                getMobileTtsController().stop()
                setSpeakingId(null)
              }}
            >
              <IconStop size={15} color={colors.accent} />
            </ActionIcon>
          </>
        ) : (
          <ActionIcon
            label="语音播放"
            onPress={() => speakMessage(msg)}
            disabled={!hasText || busy}
          >
            <IconSpeaker size={15} color={icon()} />
          </ActionIcon>
        )}

        <ActionIcon
          label={copiedId === msg.id ? '已复制' : '复制'}
          active={copiedId === msg.id}
          onPress={() => void copyMessage(msg)}
          disabled={!hasText}
        >
          <IconCopy size={15} color={icon(copiedId === msg.id)} />
        </ActionIcon>

        <ActionIcon
          label={translating ? '翻译中…' : translationVisible ? '隐藏译文' : '翻译'}
          active={translating || translationVisible}
          onPress={() => void translateMessage(msg)}
          disabled={!hasText || translating || busy}
        >
          <IconTranslate size={15} color={icon(translating || translationVisible)} />
        </ActionIcon>

        <ActionIcon
          label="重新生成"
          onPress={() => void regenerateAssistant(msg.id)}
          disabled={!hasText || busy}
        >
          <IconRefresh size={15} color={icon()} />
        </ActionIcon>

        <ActionIcon label="从此处分叉" onPress={() => forkFromMessage(msg.id)} disabled={busy}>
          <IconGitFork size={15} color={icon()} />
        </ActionIcon>

        <ActionIcon
          label="保存到笔记"
          onPress={() => saveToNote(msg)}
          disabled={!hasText}
        >
          <IconSaveNote size={15} color={icon()} />
        </ActionIcon>

        <ActionIcon label="删除" onPress={() => deleteMessage(msg.id)} disabled={busy}>
          <IconTrashMsg size={15} color={icon()} />
        </ActionIcon>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={streamScrollRef}
        style={styles.streamScroll}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() => scrollStreamToEnd(false)}
        // @ts-expect-error react-native-web className
        className="tm-agent-stream-scroll"
      >
        {!session || session.messages.length === 0 ? (
          <Text style={shellStyles.emptyHint}>
            {agentScope === 'classroom'
              ? '在下方提问开始上课。'
              : '在下方输入问题开始对话。可先点击「Toolman」配置 API，或新建左侧会话。对话会保存在本机。'}
          </Text>
        ) : (
          session.messages.map((msg) => {
            const isUser = msg.role === 'user'
            const streamingThis =
              busy && msg.role === 'assistant' && msg.id === session.messages[session.messages.length - 1]?.id
            const translation = translations[msg.id]
            const showTranslation = Boolean(translation && visibleTranslationIds[msg.id])
            const checked = selectedIds.has(msg.id)
            return (
              <View
                key={msg.id}
                style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}
              >
                {selectionMode ? (
                  <Pressable
                    accessibilityLabel="选择消息"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    onPress={() => toggleMessageSelected(msg.id)}
                    style={styles.selectHit}
                  >
                    <View style={[styles.selectBox, checked ? styles.selectBoxChecked : null]}>
                      {checked ? <IconCheckMini /> : null}
                    </View>
                  </Pressable>
                ) : null}
              <Pressable
                delayLongPress={400}
                onPress={
                  selectionMode
                    ? () => toggleMessageSelected(msg.id)
                    : undefined
                }
                onLongPress={
                  isUser
                    ? (event) => {
                        setUserMenu({ msg, ...eventPoint(event) })
                      }
                    : undefined
                }
                // @ts-expect-error react-native-web context menu
                onContextMenu={
                  isUser
                    ? (event: { preventDefault?: () => void; nativeEvent?: { pageX?: number; pageY?: number }; pageX?: number; pageY?: number }) => {
                        event.preventDefault?.()
                        setUserMenu({ msg, ...eventPoint(event) })
                      }
                    : undefined
                }
                style={[
                  styles.bubble,
                  isUser ? styles.bubbleUser : styles.bubbleAssistant,
                  isUser && checked ? styles.bubbleUserSelected : null,
                  !isUser && checked ? styles.bubbleAssistantSelected : null,
                ]}
              >
                <View style={[styles.bubbleMeta, isUser ? styles.bubbleMetaUser : null]}>
                  <Text style={styles.bubbleRole}>{isUser ? '我的' : '智能体'}</Text>
                  <Text style={styles.bubbleTime}>{formatMessageTime(msg.createdAt)}</Text>
                </View>
                {msg.content ? (
                  <MessageMarkdown
                    text={stripSocraticMachineBlocks(msg.content)}
                    align={isUser ? 'right' : 'left'}
                  />
                ) : streamingThis ? (
                  <ThinkingHeartbeat />
                ) : null}
                {showTranslation && translation ? (
                  <View style={styles.translationBox}>
                    <Text style={styles.translationLabel}>
                      译文（{translation.targetLanguage}）
                    </Text>
                    <MessageMarkdown text={translation.text} />
                  </View>
                ) : null}
                {streamingThis && !msg.content ? (
                  <View style={styles.actionsPlaceholder} />
                ) : isUser ? null : (
                  renderAssistantActions(msg)
                )}
              </Pressable>
              </View>
            )
          })
        )}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {actionHint ? <Text style={styles.hint}>{actionHint}</Text> : null}

      <ChatComposer
        value={input}
        onChangeText={setInput}
        busy={busy}
        onSend={() => void send()}
        onStop={() => abortRef.current?.abort()}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={() => patchToolbar({ webSearchEnabled: !webSearchEnabled })}
        kbEnabled={kbEnabled}
        onToggleKb={() => patchToolbar({ kbEnabled: !kbEnabled })}
        useDesktopHost={useDesktopHost}
        onToggleDesktopHost={() => patchToolbar({ useDesktopHost: !useDesktopHost })}
        paddingLeft={STREAM_PAD_SIDE}
        paddingRight={STREAM_PAD_SIDE}
        onNewTopic={
          agentScope === 'classroom'
            ? undefined
            : () => {
                const created: ChatSession = {
                  id: newId('sess'),
                  title: '新话题',
                  updatedAt: Date.now(),
                  messages: [],
                  agentScope,
                }
                upsertSession(created)
                setActiveSessionId(created.id)
                setInput('')
                setError(null)
              }
        }
        onClear={() => setInput('')}
      />

      <ChatMessageContextMenu
        visible={Boolean(userMenu)}
        x={userMenu?.x ?? 0}
        y={userMenu?.y ?? 0}
        onClose={() => setUserMenu(null)}
        items={
          userMenu
            ? [
                {
                  id: 'copy',
                  label: '复制',
                  onPress: () => {
                    void copyMessage(userMenu.msg)
                  },
                },
                {
                  id: 'edit',
                  label: '编辑',
                  onPress: () => editUserMessage(userMenu.msg),
                },
                {
                  id: 'delete',
                  label: '删除',
                  danger: true,
                  onPress: () => deleteMessage(userMenu.msg.id),
                },
                {
                  id: 'select',
                  label: '选择',
                  onPress: () => enterMessageSelection(userMenu.msg.id),
                },
                {
                  id: 'select-all',
                  label: '全选',
                  onPress: selectAllMessages,
                },
                {
                  id: 'cancel',
                  label: '取消',
                  onPress: clearUserMessageSelection,
                },
              ]
            : []
        }
      />
    </View>
  )
}

function IconCheckMini() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Polyline
        points="20 6 9 17 4 12"
        stroke="#ffffff"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function ActionIcon(props: {
  children: ReactNode
  label: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[
        styles.actionBtn,
        props.active ? styles.actionBtnActive : null,
        props.disabled ? styles.actionBtnDisabled : null,
      ]}
      hitSlop={6}
    >
      {props.children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  streamScroll: {
    flex: 1,
  },
  streamContent: {
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 22,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    alignSelf: 'stretch',
  },
  selectHit: {
    width: 28,
    height: 28,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    marginVertical: 2,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
    flexShrink: 1,
    backgroundColor: colors.accentSoft,
  },
  bubbleUserSelected: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  bubbleAssistant: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleAssistantSelected: {
    borderColor: colors.accent,
    backgroundColor: '#f3fbf7',
  },
  bubbleMeta: {
    marginBottom: 4,
  },
  bubbleMetaUser: {
    alignItems: 'flex-end',
  },
  bubbleRole: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  bubbleTime: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  bubbleText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  bubbleTextUser: {
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 8,
    paddingTop: 4,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  translationBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 4,
  },
  translationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionsPlaceholder: {
    height: 34,
    marginTop: 8,
  },
  error: {
    color: colors.danger,
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingBottom: 6,
    fontSize: 12,
  },
  hint: {
    color: colors.accent,
    paddingLeft: STREAM_PAD_SIDE,
    paddingRight: STREAM_PAD_SIDE,
    paddingBottom: 6,
    fontSize: 12,
  },
})
