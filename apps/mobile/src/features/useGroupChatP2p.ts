import { useCallback, useEffect } from 'react'
import { loadGroupChatStore, type GroupMember } from '../storage/groupChat'
import { ensureMailboxForDesktopGroup } from '../p2p/mailboxBootstrap'
import { getMailboxTarget, resumePersistedMailboxSync } from '../p2p/mailboxSync'
import { hasLiveSession } from '../p2p/session'
import { useGroupChatMesh } from './useGroupChatMesh'
import { consumePendingInvites, subscribePendingInvites } from '../p2p/pendingInvites'
import {
  peekGroupSync,
  subscribeGroupSync,
  type GroupSyncSnapshot,
} from '../sync/groupSyncBridge'
import { setGroupSyncLocalReader } from '../sync/groupSyncBridge'
import { useGroupChatInvites } from './useGroupChatInvites'
import type { GroupChatSelf } from './groupChatContext.types'
import type { useGroupChatState } from './useGroupChatState'

type Store = ReturnType<typeof useGroupChatState>

export function useGroupChatP2p(self: GroupChatSelf, store: Store) {
  const { selfIdentityId, selfDeviceId, selfName } = self
  const {
    ready,
    setReady,
    groups,
    setGroups,
    activeGroupId,
    setActiveGroupId,
    membersByGroup,
    setMembersByGroup,
    setMessagesByGroup,
    setSharedByGroup,
    activitiesByGroup,
    setActivitiesByGroup,
    invitesByGroup,
    setInvitesByGroup,
    setActiveAction,
    setExpanded,
    appendActivity,
  } = store

  const applyLivePresence = useCallback(
    (members: GroupMember[], workspaceId: string): GroupMember[] => {
      const mailbox = getMailboxTarget(workspaceId)
      const live = hasLiveSession(workspaceId)
      const ownerDeviceId = mailbox?.ownerDeviceId
      return members.map((member) => ({
        ...member,
        online:
          member.deviceId === selfDeviceId ||
          (Boolean(ownerDeviceId) &&
            member.deviceId === ownerDeviceId &&
            (live || Boolean(mailbox))) ||
          member.online,
      }))
    },
    [selfDeviceId],
  )

  const applySyncSnapshot = useCallback((snapshot: GroupSyncSnapshot) => {
    setGroups(snapshot.groups)
    setMembersByGroup(
      Object.fromEntries(
        Object.entries(snapshot.membersByGroup).map(([id, members]) => [
          id,
          applyLivePresence(members, id),
        ]),
      ),
    )
    setActiveGroupId((current) => {
      if (current && snapshot.groups.some((group) => group.id === current)) return current
      return snapshot.activeGroupId
    })
    setExpanded((prev) => {
      const next = new Set(prev)
      if (snapshot.activeGroupId) next.add(snapshot.activeGroupId)
      return next
    })
  }, [applyLivePresence, setActiveGroupId, setExpanded, setGroups, setMembersByGroup])

  useEffect(() => {
    setGroups([])
    setActiveGroupId(null)
    setMessagesByGroup({})
    setMembersByGroup({})
    setSharedByGroup({})
    setActivitiesByGroup({})
    setInvitesByGroup({})
    setExpanded(new Set())
    setReady(false)
    const unsub = subscribeGroupSync(applySyncSnapshot)
    void loadGroupChatStore().then((storeData) => {
      if (!peekGroupSync()) {
        setGroups(storeData.groups)
        setActiveGroupId(storeData.activeGroupId)
        setMessagesByGroup(storeData.messagesByGroup)
        setMembersByGroup(storeData.membersByGroup)
        setSharedByGroup(storeData.sharedByGroup)
        setActivitiesByGroup(storeData.activitiesByGroup)
        setInvitesByGroup(storeData.invitesByGroup)
        if (storeData.activeGroupId) {
          setExpanded(new Set([storeData.activeGroupId]))
        }
        setMembersByGroup((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([id, members]) => [id, applyLivePresence(members, id)]),
          ),
        )
      } else {
        setMessagesByGroup(storeData.messagesByGroup)
        setSharedByGroup(storeData.sharedByGroup)
        setActivitiesByGroup(storeData.activitiesByGroup)
        setInvitesByGroup(storeData.invitesByGroup)
      }
      setReady(true)
    })
    return () => {
      unsub()
      setGroupSyncLocalReader(null)
    }
  }, [
    applyLivePresence,
    applySyncSnapshot,
    selfIdentityId,
    setActiveGroupId,
    setActivitiesByGroup,
    setExpanded,
    setGroups,
    setInvitesByGroup,
    setMembersByGroup,
    setMessagesByGroup,
    setReady,
    setSharedByGroup,
  ])

  useGroupChatMesh({
    selfDeviceId,
    applyLivePresence,
    setGroups,
    setMembersByGroup,
    setMessagesByGroup,
    setSharedByGroup,
  })

  const desktopGroupKey = groups
    .filter((group) => group.origin === 'desktop')
    .map((group) => group.id)
    .sort()
    .join(',')

  useEffect(() => {
    if (!ready) return
    resumePersistedMailboxSync(selfDeviceId)
    if (!desktopGroupKey) return
    for (const workspaceId of desktopGroupKey.split(',')) {
      void ensureMailboxForDesktopGroup({
        workspaceId,
        deviceId: selfDeviceId,
        identityId: selfIdentityId,
        displayName: selfName,
      })
    }
  }, [ready, desktopGroupKey, selfDeviceId, selfIdentityId, selfName])

  const { applyInvites, createOrReuseInvite, joinGroupByInvite } = useGroupChatInvites({
    self,
    groups,
    membersByGroup,
    invitesByGroup,
    activitiesByGroup,
    activeGroupId,
    setGroups,
    setMembersByGroup,
    setInvitesByGroup,
    setActiveGroupId,
    setActiveAction,
    setExpanded,
    setMessagesByGroup,
    setSharedByGroup,
    appendActivity,
    applyLivePresence,
  })

  useEffect(() => {
    if (!ready) return
    const cancelled = false
    const flush = () => {
      void consumePendingInvites().then((pending) => {
        if (!cancelled) applyInvites(pending)
      })
    }
    flush()
    return subscribePendingInvites(() => flush())
  }, [applyInvites, ready])

  return { createOrReuseInvite, joinGroupByInvite }
}
