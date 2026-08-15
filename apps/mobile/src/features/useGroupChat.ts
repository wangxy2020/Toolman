import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
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
import { useMobileApp } from '../state/MobileAppContext'
import { GroupSettingsModal } from './GroupSettingsModal'
import { DEFAULT_GROUP_ACTION, type GroupSidebarAction } from './groupSidebar'
import { newId } from './groupPaneUtils'

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

export function useGroupChat(): GroupChatContextValue {
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

  return createElement(
    GroupChatContext.Provider,
    { value },
    children,
    createElement(GroupSettingsModal, {
      visible: settingsOpen,
      group: activeGroup,
      memberCount: activeGroup
        ? (membersByGroup[activeGroup.id] ?? []).filter((m) => m.status === 'active').length
        : 0,
      onClose: () => setSettingsOpen(false),
      onSave: (patch) => {
        if (!activeGroup) return
        updateGroup(activeGroup.id, patch)
      },
      onDissolve: () => {
        if (!activeGroup) return
        dissolveGroup(activeGroup.id)
      },
    }),
  )
}
