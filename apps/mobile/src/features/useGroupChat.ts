import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { canShareToDesktopGroup } from '../p2p/shareToGroup'
import { useMobileApp } from '../state/MobileAppContext'
import { GroupSettingsModal } from './GroupSettingsModal'
import type { GroupChatContextValue, GroupChatSelf } from './groupChatContext.types'
import { useGroupChatMessages } from './useGroupChatMessages'
import { useGroupChatP2p } from './useGroupChatP2p'
import { useGroupChatState } from './useGroupChatState'

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
  const { auth, device } = useMobileApp()
  const selfIdentityId = auth?.identityId ?? device.identityId ?? 'local-self'
  const selfDeviceId = device.deviceId || selfIdentityId
  const selfMemberId = selfIdentityId
  const selfName = auth?.displayName?.trim() || '我'
  const self: GroupChatSelf = { selfIdentityId, selfDeviceId, selfMemberId, selfName }

  const store = useGroupChatState(self, auth?.identityId)
  const { createOrReuseInvite, joinGroupByInvite } = useGroupChatP2p(self, store)
  const messagesApi = useGroupChatMessages({
    self,
    activeGroupId: store.activeGroupId,
    groups: store.groups,
    membersByGroup: store.membersByGroup,
    sharedByGroup: store.sharedByGroup,
    setMessagesByGroup: store.setMessagesByGroup,
    setGroups: store.setGroups,
    setSharedByGroup: store.setSharedByGroup,
    appendActivity: store.appendActivity,
  })

  const {
    ready,
    groups,
    activeGroupId,
    activeAction,
    messagesByGroup,
    membersByGroup,
    sharedByGroup,
    activitiesByGroup,
    settingsOpen,
    setSettingsOpen,
    expanded,
    createGroup,
    selectGroup,
    selectGroupAction,
    toggleExpanded,
    updateGroup,
    dissolveGroup,
  } = store

  const messages = useMemo(
    () => (activeGroupId ? (messagesByGroup[activeGroupId] ?? []) : []),
    [activeGroupId, messagesByGroup],
  )

  const canShareToActiveGroup = useMemo(() => {
    if (!activeGroupId) return true
    const group = groups.find((item) => item.id === activeGroupId)
    if (group?.origin !== 'desktop') return true
    const selfMember = (membersByGroup[activeGroupId] ?? []).find(
      (member) => member.deviceId === selfDeviceId || member.identityId === selfIdentityId,
    )
    return canShareToDesktopGroup({ group, selfMember })
  }, [activeGroupId, groups, membersByGroup, selfDeviceId, selfIdentityId])

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
      sendMessage: messagesApi.sendMessage,
      attachFile: messagesApi.attachFile,
      deleteMessage: messagesApi.deleteMessage,
      clearOwnMessages: messagesApi.clearOwnMessages,
      addSharedItems: messagesApi.addSharedItems,
      updateSharedNote: messagesApi.updateSharedNote,
      getSharedNoteBody: messagesApi.getSharedNoteBody,
      canShareToActiveGroup,
      createOrReuseInvite,
      joinGroupByInvite,
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
      messagesApi,
      canShareToActiveGroup,
      createOrReuseInvite,
      joinGroupByInvite,
      setSettingsOpen,
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
        ? new Set(
            (membersByGroup[activeGroup.id] ?? [])
              .filter((member) => member.status === 'active')
              .map((member) => member.identityId || member.deviceId),
          ).size
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
