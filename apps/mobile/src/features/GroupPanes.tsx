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
  type GroupActivity,
  type GroupChatMessage,
  type GroupInvite,
  type GroupMember,
  type GroupSharedItem,
  type GroupSharedKind,
  type GroupWorkspace,
} from '../storage/groupChat'
import { loadCreatedKnowledgeBases } from '../storage/createdKnowledgeBases'
import { loadKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import { useMobileApp } from '../state/MobileAppContext'
import { colors, shellStyles } from '../theme'
import { copyToClipboard } from '../utils/clipboard'
import { AGENT_SCOPE_LABEL } from '../chat/agentScopes'
import { ChatComposer } from './ChatComposer'
import { GroupInviteModal } from './GroupInviteModal'
import {
  GroupActivityPane,
  GroupMembersPane,
  GroupSharedResourcePane,
} from './GroupPagePanels'
import type { GroupPickerSelection } from './GroupResourcePickerModal'
import { GroupSettingsModal } from './GroupSettingsModal'
import {
  DEFAULT_GROUP_ACTION,
  GROUP_SIDEBAR_MENUS,
  getGroupSidebarMenu,
  type GroupSidebarAction,
} from './groupSidebar'
import { MessageMarkdown } from './MessageMarkdown'
import {
  SidebarAddButton,
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
  activeAction: GroupSidebarAction
  messages: GroupChatMessage[]
  members: GroupMember[]
  sharedItems: GroupSharedItem[]
  activities: GroupActivity[]
  createGroup: () => void
  selectGroup: (id: string) => void
  selectGroupAction: (groupId: string, action: GroupSidebarAction) => void
  expanded: Set<string>
  toggleExpanded: (groupId: string) => void
  updateGroup: (id: string, patch: { name: string; description?: string }) => void
  dissolveGroup: (id: string) => void
  sendMessage: (input: {
    content: string
    senderMemberId: string
    senderName: string
  }) => void
  deleteMessage: (id: string) => void
  /** Remove only messages sent by this member on the local page. */
  clearOwnMessages: (senderMemberId: string) => void
  addSharedItems: (kind: GroupSharedKind, items: GroupSharedItem[]) => void
  createOrReuseInvite: () => GroupInvite | null
  openSettingsModal: () => void
}

const GroupChatContext = createContext<GroupChatContextValue | null>(null)

function useGroupChat(): GroupChatContextValue {
  const ctx = useContext(GroupChatContext)
  if (!ctx) throw new Error('useGroupChat requires GroupChatProvider')
  return ctx
}

export function useOptionalGroupChat(): GroupChatContextValue | null {
  return useContext(GroupChatContext)
}

export function GroupChatProvider({ children }: { children: ReactNode }) {
  const { auth } = useMobileApp()
  const selfMemberId = auth?.identityId ?? 'local-self'
  const selfName = auth?.displayName?.trim() || '我'
  const [ready, setReady] = useState(false)
  const [groups, setGroups] = useState<GroupWorkspace[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [messagesByGroup, setMessagesByGroup] = useState<Record<string, GroupChatMessage[]>>({})
  const [membersByGroup, setMembersByGroup] = useState<Record<string, GroupMember[]>>({})
  const [sharedByGroup, setSharedByGroup] = useState<Record<string, GroupSharedItem[]>>({})
  const [activitiesByGroup, setActivitiesByGroup] = useState<Record<string, GroupActivity[]>>({})
  const [invitesByGroup, setInvitesByGroup] = useState<Record<string, GroupInvite>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<GroupSidebarAction>(DEFAULT_GROUP_ACTION)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    void loadGroupChatStore().then((store) => {
      setGroups(store.groups)
      setActiveGroupId(store.activeGroupId)
      setMessagesByGroup(store.messagesByGroup)
      setMembersByGroup(store.membersByGroup)
      setSharedByGroup(store.sharedByGroup)
      setActivitiesByGroup(store.activitiesByGroup)
      setInvitesByGroup(store.invitesByGroup)
      if (store.activeGroupId) {
        setExpanded(new Set([store.activeGroupId]))
      }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    void saveGroupChatStore({
      groups,
      activeGroupId,
      messagesByGroup,
      membersByGroup,
      sharedByGroup,
      activitiesByGroup,
      invitesByGroup,
    })
  }, [
    ready,
    groups,
    activeGroupId,
    messagesByGroup,
    membersByGroup,
    sharedByGroup,
    activitiesByGroup,
    invitesByGroup,
  ])

  const appendActivity = useCallback(
    (groupId: string, message: string, resourceLabel: string, sourceDeviceId?: string) => {
      setActivitiesByGroup((prev) => {
        const list = prev[groupId] ?? []
        const seq = list.reduce((max, event) => Math.max(max, event.seq), 0) + 1
        return {
          ...prev,
          [groupId]: [
            ...list,
            {
              id: newId('evt'),
              seq,
              timestamp: Date.now(),
              message,
              resourceLabel,
              sourceDeviceId,
            },
          ],
        }
      })
    },
    [],
  )

  useEffect(() => {
    if (!ready) return
    setMembersByGroup((prev) => {
      let changed = false
      const next = { ...prev }
      for (const group of groups) {
        if ((next[group.id] ?? []).length > 0) continue
        next[group.id] = [
          {
            id: selfMemberId,
            displayName: selfName,
            role: 'owner',
            deviceId: selfMemberId,
            online: true,
            status: 'active',
          },
        ]
        changed = true
      }
      return changed ? next : prev
    })
    setActivitiesByGroup((prev) => {
      let changed = false
      const next = { ...prev }
      for (const group of groups) {
        if ((next[group.id] ?? []).length > 0) continue
        next[group.id] = [
          {
            id: newId('evt'),
            seq: 1,
            timestamp: group.createdAt,
            message: `创建了群组「${group.name}」`,
            resourceLabel: '群组',
            sourceDeviceId: selfMemberId,
          },
        ]
        changed = true
      }
      return changed ? next : prev
    })
  }, [groups, ready, selfMemberId, selfName])

  const createGroup = useCallback(() => {
    const group: GroupWorkspace = {
      id: newId('group'),
      name: `群组 ${groups.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setGroups((prev) => [group, ...prev])
    setActiveGroupId(group.id)
    setActiveAction(DEFAULT_GROUP_ACTION)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(group.id)
      return next
    })
    setMessagesByGroup((prev) => ({ ...prev, [group.id]: prev[group.id] ?? [] }))
    setMembersByGroup((prev) => ({
      ...prev,
      [group.id]: [
        {
          id: selfMemberId,
          displayName: selfName,
          role: 'owner',
          deviceId: selfMemberId,
          online: true,
          status: 'active',
        },
      ],
    }))
    setSharedByGroup((prev) => ({ ...prev, [group.id]: [] }))
    setActivitiesByGroup((prev) => ({
      ...prev,
      [group.id]: [
        {
          id: newId('evt'),
          seq: 1,
          timestamp: group.createdAt,
          message: `创建了群组「${group.name}」`,
          resourceLabel: '群组',
          sourceDeviceId: selfMemberId,
        },
      ],
    }))
  }, [groups.length, selfMemberId, selfName])

  const selectGroup = useCallback((id: string) => {
    setActiveGroupId(id)
    setActiveAction(DEFAULT_GROUP_ACTION)
    setExpanded((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const selectGroupAction = useCallback((groupId: string, action: GroupSidebarAction) => {
    setActiveGroupId(groupId)
    setActiveAction(action)
    setExpanded((prev) => {
      if (prev.has(groupId)) return prev
      const next = new Set(prev)
      next.add(groupId)
      return next
    })
  }, [])

  const toggleExpanded = useCallback((groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const updateGroup = useCallback((id: string, patch: { name: string; description?: string }) => {
    setGroups((prev) =>
      prev.map((group) =>
        group.id === id
          ? { ...group, name: patch.name, description: patch.description, updatedAt: Date.now() }
          : group,
      ),
    )
    setSettingsOpen(false)
    appendActivity(id, `更新了群组信息「${patch.name}」`, '群组', selfMemberId)
  }, [appendActivity, selfMemberId])

  const dissolveGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((group) => group.id !== id))
    setMessagesByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setMembersByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setSharedByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setActivitiesByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setInvitesByGroup((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setActiveGroupId((current) => {
      if (current !== id) return current
      const remaining = groups.filter((group) => group.id !== id)
      return remaining[0]?.id ?? null
    })
    setSettingsOpen(false)
  }, [groups])

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
      appendActivity(
        activeGroupId,
        `${input.senderName} 发送了群聊消息`,
        '群聊',
        input.senderMemberId,
      )
    },
    [activeGroupId, appendActivity],
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

  const addSharedItems = useCallback(
    (kind: GroupSharedKind, items: GroupSharedItem[]) => {
      if (!activeGroupId || items.length === 0) return
      const resourceLabel =
        kind === 'agents'
          ? '智能体'
          : kind === 'knowledge'
            ? '知识库'
            : kind === 'notes'
              ? '笔记'
              : '工作流'
      const existingIds = new Set(
        (sharedByGroup[activeGroupId] ?? [])
          .filter((item) => item.kind === kind)
          .map((item) => item.id),
      )
      const incoming = items.filter((item) => !existingIds.has(item.id))
      if (incoming.length === 0) return
      setSharedByGroup((prev) => ({
        ...prev,
        [activeGroupId]: [...incoming, ...(prev[activeGroupId] ?? [])],
      }))
      for (const item of incoming) {
        appendActivity(
          activeGroupId,
          `共享了${resourceLabel}「${item.name}」`,
          resourceLabel,
          selfMemberId,
        )
      }
    },
    [activeGroupId, appendActivity, selfMemberId, sharedByGroup],
  )

  const createOrReuseInvite = useCallback((): GroupInvite | null => {
    if (!activeGroupId) return null
    const existing = invitesByGroup[activeGroupId]
    if (existing && existing.expiresAt > Date.now()) return existing
    const token = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    const origin =
      typeof globalThis.location?.origin === 'string'
        ? globalThis.location.origin
        : 'toolman://group'
    const invite: GroupInvite = {
      token,
      url: `${origin}/join?token=${encodeURIComponent(token)}`,
      expiresAt: Date.now() + 72 * 60 * 60 * 1000,
    }
    setInvitesByGroup((prev) => ({ ...prev, [activeGroupId]: invite }))
    return invite
  }, [activeGroupId, invitesByGroup])

  const messages = useMemo(
    () => (activeGroupId ? (messagesByGroup[activeGroupId] ?? []) : []),
    [activeGroupId, messagesByGroup],
  )

  const value = useMemo(
    () => ({
      ready,
      groups,
      activeGroupId,
      activeAction,
      messages,
      members: activeGroupId ? (membersByGroup[activeGroupId] ?? []) : [],
      sharedItems: activeGroupId ? (sharedByGroup[activeGroupId] ?? []) : [],
      activities: activeGroupId ? (activitiesByGroup[activeGroupId] ?? []) : [],
      createGroup,
      selectGroup,
      selectGroupAction,
      expanded,
      toggleExpanded,
      updateGroup,
      dissolveGroup,
      sendMessage,
      deleteMessage,
      clearOwnMessages,
      addSharedItems,
      createOrReuseInvite,
      openSettingsModal: () => setSettingsOpen(true),
    }),
    [
      ready,
      groups,
      activeGroupId,
      activeAction,
      messages,
      membersByGroup,
      sharedByGroup,
      activitiesByGroup,
      createGroup,
      selectGroup,
      selectGroupAction,
      expanded,
      toggleExpanded,
      updateGroup,
      dissolveGroup,
      sendMessage,
      deleteMessage,
      clearOwnMessages,
      addSharedItems,
      createOrReuseInvite,
    ],
  )

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null

  return (
    <GroupChatContext.Provider value={value}>
      {children}
      <GroupSettingsModal
        visible={settingsOpen}
        group={activeGroup}
        memberCount={
          activeGroup
            ? (membersByGroup[activeGroup.id] ?? []).filter((m) => m.status === 'active').length
            : 0
        }
        onClose={() => setSettingsOpen(false)}
        onSave={(patch) => {
          if (!activeGroup) return
          updateGroup(activeGroup.id, patch)
        }}
        onDissolve={() => {
          if (!activeGroup) return
          dissolveGroup(activeGroup.id)
        }}
      />
    </GroupChatContext.Provider>
  )
}

export function GroupLeftPane() {
  const { setLeftOpen } = useMobileApp()
  const {
    groups,
    activeGroupId,
    activeAction,
    createGroup,
    selectGroup,
    selectGroupAction,
    expanded,
    toggleExpanded,
  } = useGroupChat()

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
          groups.map((group) => {
            const isOpen = expanded.has(group.id)
            const isActive = group.id === activeGroupId
            return (
              <View key={group.id} style={styles.groupBlock}>
                <View style={[styles.groupRow, isActive ? styles.groupRowActive : null]}>
                  <Pressable
                    accessibilityLabel={isOpen ? '折叠' : '展开'}
                    onPress={() => toggleExpanded(group.id)}
                    style={({ pressed }) => [
                      styles.expandHit,
                      pressed ? styles.expandHitPressed : null,
                    ]}
                  >
                    <Text
                      style={[styles.chevron, isOpen ? styles.chevronOpen : null]}
                      accessibilityElementsHidden
                    >
                      ›
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => {
                      selectGroup(group.id)
                      setLeftOpen(false)
                    }}
                    style={styles.groupNameHit}
                  >
                    <Text
                      style={[styles.groupName, isActive ? styles.groupNameActive : null]}
                      numberOfLines={1}
                    >
                      {group.name}
                    </Text>
                  </Pressable>
                </View>
                {isOpen
                  ? GROUP_SIDEBAR_MENUS.map((menu) => {
                      const childActive = isActive && activeAction === menu.id
                      return (
                        <Pressable
                          key={menu.id}
                          onPress={() => {
                            selectGroupAction(group.id, menu.id)
                            setLeftOpen(false)
                          }}
                          style={({ pressed }) => [
                            styles.subItem,
                            childActive ? styles.subItemActive : null,
                            pressed && !childActive ? styles.subItemPressed : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subItemLabel,
                              childActive ? styles.subItemLabelActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {menu.label}
                          </Text>
                        </Pressable>
                      )
                    })
                  : null}
              </View>
            )
          })
        )}
      </SidebarList>
    </SidebarShell>
  )
}

export function GroupRightPane() {
  const { auth, sessions, notebooks, notes, knowledgeMeta } = useMobileApp()
  const {
    groups,
    activeGroupId,
    activeAction,
    ready,
    members,
    sharedItems,
    activities,
    addSharedItems,
    createOrReuseInvite,
  } = useGroupChat()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState<GroupInvite | null>(null)
  const [createdKbs, setCreatedKbs] = useState<Array<{ id: string; name: string }>>([])
  const [docsByKb, setDocsByKb] = useState<Record<string, Array<{ id: string; name: string }>>>({})
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null
  const selfMemberId = auth?.identityId ?? 'local-self'

  useEffect(() => {
    if (activeAction !== 'knowledge') return
    void loadCreatedKnowledgeBases().then((items) =>
      setCreatedKbs(items.map((item) => ({ id: item.id, name: item.name }))),
    )
    void loadKnowledgeSnapshot().then((snapshot) => {
      if (!snapshot) return
      const next: Record<string, Array<{ id: string; name: string }>> = {}
      for (const doc of snapshot.documents) {
        const list = next[doc.kbId] ?? []
        list.push({ id: doc.id, name: doc.title })
        next[doc.kbId] = list
      }
      setDocsByKb(next)
    })
  }, [activeAction])

  const pickerGroups = useMemo(() => {
    const sharedIds = new Set(
      sharedItems
        .filter((item) => item.kind === activeAction)
        .map((item) => item.id),
    )
    if (activeAction === 'agents') {
      const byScope = new Map<string, Array<{ id: string; name: string }>>()
      for (const session of sessions) {
        if (sharedIds.has(session.id)) continue
        const list = byScope.get(session.agentScope) ?? []
        list.push({ id: session.id, name: session.title || '未命名话题' })
        byScope.set(session.agentScope, list)
      }
      return [...byScope.entries()].map(([scope, items]) => ({
        id: scope,
        name: AGENT_SCOPE_LABEL[scope as keyof typeof AGENT_SCOPE_LABEL] ?? scope,
        items,
      }))
    }
    if (activeAction === 'notes') {
      return notebooks.map((notebook) => ({
        id: notebook.id,
        name: notebook.name,
        items: notes
          .filter((note) => note.notebookId === notebook.id && !sharedIds.has(note.id))
          .map((note) => ({ id: note.id, name: note.title || '未命名笔记' })),
      }))
    }
    if (activeAction === 'knowledge') {
      const kbs = [
        ...createdKbs,
        ...knowledgeMeta
          .filter((item) => !createdKbs.some((kb) => kb.id === item.id))
          .map((item) => ({ id: item.id, name: item.name })),
      ]
      return kbs.map((kb) => ({
        id: kb.id,
        name: kb.name,
        items: (docsByKb[kb.id] ?? []).filter((doc) => !sharedIds.has(doc.id)),
      }))
    }
    return []
  }, [
    activeAction,
    createdKbs,
    docsByKb,
    knowledgeMeta,
    notebooks,
    notes,
    sessions,
    sharedItems,
  ])

  if (!ready) {
    return <Text style={shellStyles.emptyHint}>加载群组…</Text>
  }

  if (!activeGroup) {
    return (
      <View style={styles.emptyPane}>
        <Text style={styles.emptyTitle}>选择或创建群组</Text>
        <Text style={styles.emptyHint}>
          在左侧创建群组，或展开群组后选择成员、消息、智能体等二级菜单。
        </Text>
      </View>
    )
  }

  const handleAddShared = (kind: GroupSharedKind, selection: GroupPickerSelection[]) => {
    const items: GroupSharedItem[] = []
    const now = Date.now()
    for (const group of selection) {
      if (group.items.length === 0) {
        items.push({ id: group.groupId, name: group.groupName, kind, addedAt: now })
        continue
      }
      for (const item of group.items) {
        items.push({
          id: item.id,
          name: item.name,
          kind,
          parentId: group.groupId,
          parentName: group.groupName,
          addedAt: now,
        })
      }
    }
    addSharedItems(kind, items)
  }

  return (
    <>
      {activeAction === 'messages' ? <GroupMessagesPane /> : null}
      {activeAction === 'members' ? (
        <GroupMembersPane
          groupName={activeGroup.name}
          members={members}
          selfMemberId={selfMemberId}
          onInvite={() => {
            setInvite(createOrReuseInvite())
            setInviteOpen(true)
          }}
        />
      ) : null}
      {activeAction === 'activity' ? (
        <GroupActivityPane groupName={activeGroup.name} events={activities} />
      ) : null}
      {activeAction === 'agents' ||
      activeAction === 'knowledge' ||
      activeAction === 'notes' ||
      activeAction === 'workflow' ? (
        <GroupSharedResourcePane
          kind={activeAction}
          title={getGroupSidebarMenu(activeAction).title}
          typeNoun={getGroupSidebarMenu(activeAction).typeNoun}
          groupName={activeGroup.name}
          items={sharedItems.filter((item) => item.kind === activeAction)}
          pickerGroups={pickerGroups}
          onAdd={(selection) => handleAddShared(activeAction, selection)}
        />
      ) : null}
      <GroupInviteModal
        visible={inviteOpen}
        groupName={activeGroup.name}
        invite={invite}
        onClose={() => setInviteOpen(false)}
      />
    </>
  )
}

function GroupMessagesPane() {
  const { auth } = useMobileApp()
  const { activeGroupId, messages, sendMessage, deleteMessage, clearOwnMessages } = useGroupChat()
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null)
  const [composerPopupOpen, setComposerPopupOpen] = useState(false)
  const [popupDismissToken, setPopupDismissToken] = useState(0)
  const streamScrollRef = useRef<ScrollView>(null)
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
  groupBlock: {
    marginBottom: 2,
  },
  groupRow: {
    marginHorizontal: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingRight: 10,
    paddingLeft: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupRowActive: {
    backgroundColor: colors.hover,
  },
  expandHit: {
    width: 22,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandHitPressed: {
    opacity: 0.7,
  },
  chevron: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.textSecondary,
    transform: [{ rotate: '0deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  groupNameHit: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  groupNameActive: {
    color: colors.text,
    fontWeight: '500',
  },
  subItem: {
    marginLeft: 28,
    marginRight: 10,
    marginVertical: 2,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    justifyContent: 'center',
  },
  subItemActive: {
    backgroundColor: colors.accentSoft,
  },
  subItemPressed: {
    backgroundColor: colors.hover,
  },
  subItemLabel: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  },
  subItemLabelActive: {
    color: colors.text,
    fontWeight: '500',
  },
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
