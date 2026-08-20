import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { canWriteWorkspace } from '@toolman/shared'
import type {
  GroupActivity,
  GroupChatMessage,
  GroupMember,
  GroupSharedItem,
  GroupSharedKind,
  GroupWorkspace,
} from '../storage/groupChat'
import { pushLocalBlob } from '../p2p/blobMesh'
import { putBlob } from '../p2p/blobStore'
import { sha256Hex } from '../p2p/bytes'
import { sendGroupChatOverMesh } from '../p2p/groupChatMesh'
import { getNoteMirror } from '../p2p/noteMirror'
import { canShareToDesktopGroup, proposePickerShares, proposeSharedNoteUpdate } from '../p2p/shareToGroup'
import { newId } from './groupPaneUtils'
import type { GroupChatSelf } from './groupChatContext.types'

type SetByGroup<T> = Dispatch<SetStateAction<Record<string, T[]>>>

interface MessageDeps {
  self: GroupChatSelf
  activeGroupId: string | null
  groups: GroupWorkspace[]
  membersByGroup: Record<string, GroupMember[]>
  sharedByGroup: Record<string, GroupSharedItem[]>
  setMessagesByGroup: SetByGroup<GroupChatMessage>
  setGroups: Dispatch<SetStateAction<GroupWorkspace[]>>
  setSharedByGroup: SetByGroup<GroupSharedItem>
  appendActivity: (groupId: string, message: string, resourceLabel: string, sourceDeviceId?: string) => void
}

export function useGroupChatMessages({
  self,
  activeGroupId,
  groups,
  membersByGroup,
  sharedByGroup,
  setMessagesByGroup,
  setGroups,
  setSharedByGroup,
  appendActivity,
}: MessageDeps) {
  const { selfIdentityId, selfDeviceId, selfMemberId, selfName } = self

  const sendMessage = useCallback(
    (input: {
      content: string
      senderMemberId: string
      senderName: string
      attachment?: { name: string; contentHash: string; mimeType: string }
    }) => {
      if (!activeGroupId) return
      const group = groups.find((item) => item.id === activeGroupId)
      const selfMember = (membersByGroup[activeGroupId] ?? []).find(
        (member) => member.deviceId === selfDeviceId || member.identityId === selfIdentityId,
      )
      if (group?.origin === 'desktop' && selfMember && !canWriteWorkspace(selfMember.role)) {
        appendActivity(activeGroupId, '只读成员无法发送群聊', '群聊', selfMember.id)
        return
      }
      const senderMemberId = selfMember?.id || input.senderMemberId
      const local: GroupChatMessage = {
        id: newId('gmsg'),
        groupId: activeGroupId,
        senderMemberId,
        senderName: input.senderName,
        content: input.content || (input.attachment ? `[文件] ${input.attachment.name}` : ''),
        createdAt: Date.now(),
        attachment: input.attachment,
      }
      const applyLocal = (message: GroupChatMessage) => {
        setMessagesByGroup((prev) => {
          const list = prev[activeGroupId] ?? []
          if (list.some((item) => item.id === message.id)) return prev
          return { ...prev, [activeGroupId]: [...list, message] }
        })
        setGroups((prev) =>
          prev
            .map((g) => (g.id === activeGroupId ? { ...g, updatedAt: Date.now() } : g))
            .sort((a, b) => b.updatedAt - a.updatedAt),
        )
        appendActivity(activeGroupId, `${input.senderName} 发送了群聊消息`, '群聊', senderMemberId)
      }
      if (group?.origin === 'desktop') {
        void sendGroupChatOverMesh({
          workspaceId: activeGroupId,
          senderMemberId,
          senderName: input.senderName,
          deviceId: selfDeviceId,
          text: input.content,
          attachment: input.attachment,
        }).then((message) => applyLocal(message))
        return
      }
      applyLocal(local)
    },
    [
      activeGroupId,
      appendActivity,
      groups,
      membersByGroup,
      selfDeviceId,
      selfIdentityId,
      setGroups,
      setMessagesByGroup,
    ],
  )

  const attachFile = useCallback(
    async (file: { name: string; mimeType: string; bytes: Uint8Array }) => {
      if (!activeGroupId) return
      let contentHash: string
      try {
        contentHash = (await pushLocalBlob({
          workspaceId: activeGroupId,
          name: file.name,
          mimeType: file.mimeType,
          bytes: file.bytes,
        })).contentHash
      } catch {
        contentHash = await sha256Hex(file.bytes)
        putBlob({
          contentHash,
          mimeType: file.mimeType,
          name: file.name,
          bytes: file.bytes,
        })
      }
      sendMessage({
        content: '',
        senderMemberId: selfMemberId,
        senderName: selfName,
        attachment: { name: file.name, contentHash, mimeType: file.mimeType },
      })
    },
    [activeGroupId, selfMemberId, selfName, sendMessage],
  )

  const deleteMessage = useCallback(
    (id: string) => {
      if (!activeGroupId) return
      setMessagesByGroup((prev) => ({
        ...prev,
        [activeGroupId]: (prev[activeGroupId] ?? []).filter((m) => m.id !== id),
      }))
    },
    [activeGroupId, setMessagesByGroup],
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
    [activeGroupId, setMessagesByGroup],
  )

  const addSharedItems = useCallback(
    (
      kind: GroupSharedKind,
      items: GroupSharedItem[],
      extras?: { noteBodies?: Record<string, string> },
    ) => {
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
      const group = groups.find((item) => item.id === activeGroupId)
      const selfMember = (membersByGroup[activeGroupId] ?? []).find(
        (member) => member.deviceId === selfDeviceId || member.identityId === selfIdentityId,
      )
      if (canShareToDesktopGroup({ group, selfMember })) {
        void proposePickerShares({
          workspaceId: activeGroupId,
          kind,
          items: incoming,
          operatorId: selfMember?.id || selfMemberId,
          sourceDeviceId: selfDeviceId,
          noteBodies: extras?.noteBodies,
        })
      }
    },
    [
      activeGroupId,
      appendActivity,
      groups,
      membersByGroup,
      selfDeviceId,
      selfIdentityId,
      selfMemberId,
      setSharedByGroup,
      sharedByGroup,
    ],
  )

  const updateSharedNote = useCallback(
    (itemId: string, content: string) => {
      if (!activeGroupId) return
      const item = (sharedByGroup[activeGroupId] ?? []).find(
        (shared) => shared.id === itemId && shared.kind === 'notes',
      )
      if (!item) return
      const selfMember = (membersByGroup[activeGroupId] ?? []).find(
        (member) => member.deviceId === selfDeviceId || member.identityId === selfIdentityId,
      )
      void proposeSharedNoteUpdate({
        workspaceId: activeGroupId,
        noteId: itemId,
        title: item.name,
        content,
        operatorId: selfMember?.id || selfMemberId,
        sourceDeviceId: selfDeviceId,
      })
    },
    [
      activeGroupId,
      membersByGroup,
      selfDeviceId,
      selfIdentityId,
      selfMemberId,
      sharedByGroup,
    ],
  )

  const getSharedNoteBody = useCallback(
    (itemId: string) => {
      if (!activeGroupId) return undefined
      return getNoteMirror(activeGroupId, itemId)?.content
    },
    [activeGroupId],
  )

  return {
    sendMessage,
    attachFile,
    deleteMessage,
    clearOwnMessages,
    addSharedItems,
    updateSharedNote,
    getSharedNoteBody,
  }
}

export type { GroupActivity }
