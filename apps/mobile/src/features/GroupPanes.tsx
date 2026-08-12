import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  loadGroupChatStore,
  saveGroupChatStore,
  type GroupChatMessage,
  type GroupWorkspace,
} from '../storage/groupChat'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import { copyToClipboard } from '../utils/clipboard'
import { ChatComposer } from './ChatComposer'
import { MessageMarkdown } from './MessageMarkdown'
import {
  SidebarAddButton,
  SidebarItem,
  SidebarList,
  SidebarShell,
  sidebarStyles,
} from './sidebarUi'

const STREAM_PAD_SIDE = 20

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

type GroupChatContextValue = {
  ready: boolean
  groups: GroupWorkspace[]
  activeGroupId: string | null
  messages: GroupChatMessage[]
  createGroup: () => void
  selectGroup: (id: string) => void
  sendMessage: (input: {
    content: string
    senderMemberId: string
    senderName: string
  }) => void
  deleteMessage: (id: string) => void
  /** Remove only messages sent by this member on the local page. */
  clearOwnMessages: (senderMemberId: string) => void
}

const GroupChatContext = createContext<GroupChatContextValue | null>(null)

function useGroupChat(): GroupChatContextValue {
  const ctx = useContext(GroupChatContext)
  if (!ctx) throw new Error('useGroupChat requires GroupChatProvider')
  return ctx
}

export function GroupChatProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [groups, setGroups] = useState<GroupWorkspace[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [messagesByGroup, setMessagesByGroup] = useState<Record<string, GroupChatMessage[]>>({})

  useEffect(() => {
    void loadGroupChatStore().then((store) => {
      setGroups(store.groups)
      setActiveGroupId(store.activeGroupId)
      setMessagesByGroup(store.messagesByGroup)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    void saveGroupChatStore({ groups, activeGroupId, messagesByGroup })
  }, [ready, groups, activeGroupId, messagesByGroup])

  const createGroup = useCallback(() => {
    const group: GroupWorkspace = {
      id: newId('group'),
      name: `群组 ${groups.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setGroups((prev) => [group, ...prev])
    setActiveGroupId(group.id)
    setMessagesByGroup((prev) => ({ ...prev, [group.id]: prev[group.id] ?? [] }))
  }, [groups.length])

  const selectGroup = useCallback((id: string) => {
    setActiveGroupId(id)
  }, [])

  const sendMessage = useCallback(
    (input: { content: string; senderMemberId: string; senderName: string }) => {
      if (!activeGroupId) return
      const message: GroupChatMessage = {
        id: newId('gmsg'),
        groupId: activeGroupId,
        senderMemberId: input.senderMemberId,
        senderName: input.senderName,
        content: input.content,
        createdAt: Date.now(),
      }
      setMessagesByGroup((prev) => ({
        ...prev,
        [activeGroupId]: [...(prev[activeGroupId] ?? []), message],
      }))
      setGroups((prev) =>
        prev
          .map((g) => (g.id === activeGroupId ? { ...g, updatedAt: Date.now() } : g))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      )
    },
    [activeGroupId],
  )

  const deleteMessage = useCallback(
    (id: string) => {
      if (!activeGroupId) return
      setMessagesByGroup((prev) => ({
        ...prev,
        [activeGroupId]: (prev[activeGroupId] ?? []).filter((m) => m.id !== id),
      }))
    },
    [activeGroupId],
  )

  const clearOwnMessages = useCallback(
    (senderMemberId: string) => {
      if (!activeGroupId) return
      setMessagesByGroup((prev) => ({
        ...prev,
        [activeGroupId]: (prev[activeGroupId] ?? []).filter(
          (m) => m.senderMemberId !== senderMemberId,
        ),
      }))
    },
    [activeGroupId],
  )

  const messages = useMemo(
    () => (activeGroupId ? (messagesByGroup[activeGroupId] ?? []) : []),
    [activeGroupId, messagesByGroup],
  )

  const value = useMemo(
    () => ({
      ready,
      groups,
      activeGroupId,
      messages,
      createGroup,
      selectGroup,
      sendMessage,
      deleteMessage,
      clearOwnMessages,
    }),
    [
      ready,
      groups,
      activeGroupId,
      messages,
      createGroup,
      selectGroup,
      sendMessage,
      deleteMessage,
      clearOwnMessages,
    ],
  )

  return <GroupChatContext.Provider value={value}>{children}</GroupChatContext.Provider>
}

export function GroupLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const { groups, activeGroupId, createGroup, selectGroup } = useGroupChat()

  return (
    <SidebarShell>
      <SidebarAddButton
        label="创建群组"
        onPress={() => {
          createGroup()
          setLeftOpen(false)
        }}
      />
      <SidebarList>
        {groups.length === 0 ? (
          <Text style={sidebarStyles.empty}>暂无群组</Text>
        ) : (
          groups.map((group) => (
            <SidebarItem
              key={group.id}
              label={group.name}
              active={group.id === activeGroupId}
              onPress={() => {
                selectGroup(group.id)
                setLeftOpen(false)
              }}
            />
          ))
        )}
      </SidebarList>
    </SidebarShell>
  )
}

export function GroupRightPane() {
  const { auth } = useMobileApp()
  const {
    groups,
    activeGroupId,
    messages,
    sendMessage,
    deleteMessage,
    clearOwnMessages,
    ready,
  } = useGroupChat()
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null)
  const [composerPopupOpen, setComposerPopupOpen] = useState(false)
  const [popupDismissToken, setPopupDismissToken] = useState(0)
  const streamScrollRef = useRef<ScrollView>(null)
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null
  const selfMemberId = auth?.identityId ?? 'local-self'
  const selfName = auth?.displayName?.trim() || '我'

  const scrollToEnd = (animated = false) => {
    requestAnimationFrame(() => {
      streamScrollRef.current?.scrollToEnd({ animated })
    })
  }

  useEffect(() => {
    scrollToEnd(false)
  }, [activeGroupId, messages.length])

  useEffect(() => {
    setMenuMessageId(null)
  }, [activeGroupId])

  const handleSend = () => {
    const text = input.trim()
    if (!text || !activeGroupId) return
    sendMessage({
      content: text,
      senderMemberId: selfMemberId,
      senderName: selfName,
    })
    setInput('')
    setMenuMessageId(null)
    scrollToEnd(true)
  }

  if (!ready) {
    return <Text style={shellStyles.emptyHint}>加载群组…</Text>
  }

  if (!activeGroup) {
    return (
      <View style={styles.emptyPane}>
        <Text style={styles.emptyTitle}>选择或创建群组</Text>
        <Text style={styles.emptyHint}>
          在左侧创建群组，开始成员群聊。此处发送的是群组消息，不会调用大模型。
        </Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {composerPopupOpen ? (
          <Pressable
            style={styles.popupDismiss}
            onPress={() => {
              setPopupDismissToken((n) => n + 1)
              setComposerPopupOpen(false)
            }}
            accessibilityLabel="关闭菜单"
          />
        ) : null}
        <ScrollView
          ref={streamScrollRef}
          style={styles.streamScroll}
          contentContainerStyle={styles.streamContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToEnd(false)}
          onScrollBeginDrag={() => {
            setMenuMessageId(null)
            if (composerPopupOpen) {
              setPopupDismissToken((n) => n + 1)
              setComposerPopupOpen(false)
            }
          }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <Text style={shellStyles.emptyHint}>
              暂无消息{'\n'}在这里输入消息，按 Enter 发送
            </Text>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.senderMemberId === selfMemberId
              const showActions = menuMessageId === msg.id
              return (
                <Pressable
                  key={msg.id}
                  onLongPress={() => setMenuMessageId(msg.id)}
                  delayLongPress={350}
                  onPress={() => {
                    if (menuMessageId) setMenuMessageId(null)
                    if (composerPopupOpen) {
                      setPopupDismissToken((n) => n + 1)
                      setComposerPopupOpen(false)
                    }
                  }}
                  style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapPeer]}
                >
                  <View style={[styles.bubbleMeta, isOwn ? styles.bubbleMetaOwn : null]}>
                    <Text style={styles.bubbleRole}>
                      {isOwn ? '我的' : msg.senderName || '成员'}
                    </Text>
                    <Text style={styles.bubbleTime}>{formatMessageTime(msg.createdAt)}</Text>
                  </View>
                  <View
                    style={[
                      styles.bubbleBody,
                      isOwn ? styles.bubbleBodyOwn : styles.bubbleBodyPeer,
                    ]}
                  >
                    <MessageMarkdown text={msg.content} align={isOwn ? 'right' : 'left'} />
                  </View>
                  {showActions ? (
                    <View style={[styles.actions, isOwn ? styles.actionsOwn : null]}>
                      <Pressable
                        accessibilityLabel={copiedId === msg.id ? '已复制' : '复制'}
                        onPress={() => {
                          void copyToClipboard(msg.content).then(() => {
                            setCopiedId(msg.id)
                            setTimeout(
                              () => setCopiedId((id) => (id === msg.id ? null : id)),
                              1200,
                            )
                          })
                        }}
                        style={styles.actionBtn}
                      >
                        <Text
                          style={[
                            styles.actionLabel,
                            copiedId === msg.id ? styles.actionLabelActive : null,
                          ]}
                        >
                          {copiedId === msg.id ? '已复制' : '复制'}
                        </Text>
                      </Pressable>
                      {isOwn ? (
                        <Pressable
                          accessibilityLabel="删除"
                          onPress={() => {
                            deleteMessage(msg.id)
                            setMenuMessageId(null)
                          }}
                          style={styles.actionBtn}
                        >
                          <Text style={styles.actionLabel}>删除</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>

      <ChatComposer
        mode="group"
        value={input}
        onChangeText={setInput}
        onSend={handleSend}
        onClearChat={() => clearOwnMessages(selfMemberId)}
        onPopupOpenChange={setComposerPopupOpen}
        popupDismissToken={popupDismissToken}
        placeholder="输入群组消息…"
        paddingLeft={STREAM_PAD_SIDE}
        paddingRight={STREAM_PAD_SIDE}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  emptyPane: {
    flex: 1,
    padding: 24,
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  streamScroll: {
    flex: 1,
  },
  popupDismiss: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  streamContent: {
    paddingHorizontal: STREAM_PAD_SIDE,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
  },
  bubbleWrap: {
    maxWidth: '88%',
    gap: 4,
  },
  bubbleWrapOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleWrapPeer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleMeta: {
    gap: 2,
  },
  bubbleMetaOwn: {
    alignItems: 'flex-end',
  },
  bubbleRole: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  bubbleTime: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  bubbleBody: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleBodyOwn: {
    backgroundColor: colors.accentSoft,
  },
  bubbleBodyPeer: {
    backgroundColor: colors.hover,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  actionsOwn: {
    justifyContent: 'flex-end',
  },
  actionBtn: {
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionLabelActive: {
    color: colors.accent,
  },
})
