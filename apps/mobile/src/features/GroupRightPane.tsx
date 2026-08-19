import { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { loadCreatedKnowledgeBases } from '../storage/createdKnowledgeBases'
import { loadKnowledgeSnapshot } from '../storage/knowledgeSnapshot'
import type { GroupInvite, GroupSharedKind } from '../storage/groupChat'
import { useMobileApp } from '../state/MobileAppContext'
import { shellStyles } from '../theme'
import { GroupInviteModal } from './GroupInviteModal'
import {
  GroupActivityPane,
  GroupMembersPane,
  GroupSharedAgentsPane,
  GroupSharedResourcePane,
} from './GroupPagePanels'
import {
  buildGroupAgentProxy,
  createGroupAgentProxySession,
  findGroupAgentProxySession,
} from './groupAgentUtils'
import type { GroupPickerSelection } from './GroupResourcePickerModal'
import { getGroupSidebarMenu } from './groupSidebar'
import { groupPaneStyles as styles } from './groupPaneStyles'
import {
  buildGroupPickerGroups,
  groupKnowledgeDocsByKb,
  noteBodiesFromPickerSelection,
  sharedItemsFromPickerSelection,
} from './groupPaneUtils'
import { fetchGroupAgentHistory } from '../p2p/agentRelay'
import { blobObjectUrl, getBlob } from '../p2p/blobStore'
import { hasLiveSession } from '../p2p/session'
import { getNoteMirror } from '../p2p/noteMirror'
import { GroupMessagesPane } from './GroupMessagesPane'
import { useGroupChat } from './useGroupChat'

export function GroupRightPane() {
  const {
    auth,
    device,
    sessions,
    notebooks,
    notes,
    knowledgeMeta,
    setModule,
    upsertSession,
    setActiveSessionId,
    setLeftOpen,
  } = useMobileApp()
  const {
    groups,
    activeGroupId,
    activeAction,
    ready,
    members,
    sharedItems,
    activities,
    addSharedItems,
    updateSharedNote,
    getSharedNoteBody,
    canShareToActiveGroup,
    createOrReuseInvite,
    removeMember,
    updateMemberRole,
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
      setDocsByKb(groupKnowledgeDocsByKb(snapshot.documents))
    })
  }, [activeAction, auth?.identityId])

  const pickerGroups = useMemo(
    () =>
      buildGroupPickerGroups({
        activeAction,
        sharedItems,
        sessions,
        notebooks,
        notes,
        knowledgeMeta,
        createdKbs,
        docsByKb,
      }),
    [
      activeAction,
      createdKbs,
      docsByKb,
      knowledgeMeta,
      notebooks,
      notes,
      sessions,
      sharedItems,
    ],
  )

  if (!ready) {
    return <Text style={shellStyles.emptyHint}>加载群组…</Text>
  }

  if (!activeGroup) {
    return (
      <View style={styles.emptyPane}>
        <Text style={styles.emptyTitle}>选择或创建群组</Text>
        <Text style={styles.emptyHint}>
          在左侧创建群组、粘贴邀请链接加入，或展开群组后选择成员、消息、智能体等二级菜单。
        </Text>
      </View>
    )
  }

  const handleAddShared = (kind: GroupSharedKind, selection: GroupPickerSelection[]) => {
    addSharedItems(kind, sharedItemsFromPickerSelection(kind, selection), {
      noteBodies: kind === 'notes' ? noteBodiesFromPickerSelection(selection, notes) : undefined,
    })
  }

  return (
    <>
      {activeAction === 'messages' ? <GroupMessagesPane /> : null}
      {activeAction === 'members' ? (
        <GroupMembersPane
          groupName={activeGroup.name}
          members={members}
          selfMemberId={selfMemberId}
          selfDeviceId={device.deviceId}
          ownerIdentityId={activeGroup.ownerIdentityId}
          ownerDeviceId={activeGroup.ownerDeviceId}
          onInvite={() => {
            setInvite(createOrReuseInvite())
            setInviteOpen(true)
          }}
          onRemoveMember={removeMember}
          onUpdateMemberRole={updateMemberRole}
        />
      ) : null}
      {activeAction === 'activity' ? (
        <GroupActivityPane groupName={activeGroup.name} events={activities} />
      ) : null}
      {activeAction === 'agents' ? (
        <GroupSharedAgentsPane
          title={getGroupSidebarMenu('agents').title}
          typeNoun={getGroupSidebarMenu('agents').typeNoun}
          groupName={activeGroup.name}
          items={sharedItems.filter((item) => item.kind === 'agents')}
          pickerGroups={pickerGroups}
          canAdd={canShareToActiveGroup}
          onAdd={(selection) => handleAddShared('agents', selection)}
          onOpenTopic={(section, topic) => {
            const existing = findGroupAgentProxySession(
              sessions,
              activeGroup.id,
              topic.id,
            )
            const session = createGroupAgentProxySession({
              title: topic.name,
              existing,
              groupAgent: buildGroupAgentProxy({
                workspaceId: activeGroup.id,
                groupName: activeGroup.name,
                section,
                topic,
                ownerDeviceId: activeGroup.ownerDeviceId,
              }),
            })
            upsertSession(session)
            setActiveSessionId(session.id)
            setModule('agent')
            setLeftOpen(false)
            if (hasLiveSession(activeGroup.id) && session.messages.length === 0) {
              void fetchGroupAgentHistory({
                workspaceId: activeGroup.id,
                resourceId: session.groupAgent!.resourceId,
                sourceSessionId: topic.id,
                ownerDeviceId: activeGroup.ownerDeviceId,
              })
                .then(({ title, messages }) => {
                  if (messages.length === 0) return
                  upsertSession({
                    ...session,
                    title: title?.trim() || session.title,
                    messages,
                    updatedAt: Date.now(),
                  })
                })
                .catch(() => undefined)
            }
          }}
        />
      ) : null}
      {activeAction === 'knowledge' ||
      activeAction === 'notes' ||
      activeAction === 'workflow' ? (
        <GroupSharedResourcePane
          kind={activeAction}
          title={getGroupSidebarMenu(activeAction).title}
          typeNoun={getGroupSidebarMenu(activeAction).typeNoun}
          groupName={activeGroup.name}
          items={sharedItems.filter((item) => item.kind === activeAction)}
          pickerGroups={pickerGroups}
          canAdd={canShareToActiveGroup}
          getDetail={(item) => {
            const mirror = activeGroupId ? getNoteMirror(activeGroupId, item.id) : undefined
            const body = getSharedNoteBody(item.id) ?? mirror?.content ?? item.preview
            const blob = item.contentHash ? getBlob(item.contentHash) : undefined
            const canEdit =
              item.kind === 'notes' &&
              (item.permission === 'write' ||
                item.permission === 'admin' ||
                mirror?.permission === 'write')
            return {
              title: item.name,
              body,
              blobUrl: item.contentHash ? blobObjectUrl(item.contentHash) : undefined,
              mimeType: item.mimeType ?? blob?.mimeType,
              canEdit,
            }
          }}
          onAdd={(selection) => handleAddShared(activeAction, selection)}
          onSaveNote={(item, content) => updateSharedNote(item.id, content)}
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
