import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { canManageWorkspaceMembers, resolvePeerMemberDisplayName } from '@toolman/shared'
import { IconPlus } from '../icons/composer-icons'
import { IconMoreHorizontal } from '../icons/nav-icons'
import {
  groupMemberRoleLabel,
  type GroupMember,
  type GroupMemberRole,
} from '../storage/groupChat'
import { colors } from '../theme'
import { GroupMemberManageMenu } from './GroupMemberManageMenu'
import { GroupPanelHeader } from './GroupPanelHeader'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'
import {
  canManageTargetPerson,
  groupVisibleMembersByPerson,
  isSelfGroupMember,
  memberAvatarInitial,
  memberDevicePresenceLine,
  resolveSelfMemberRole,
} from './groupPagePanelUtils'

export function GroupMembersPane(props: {
  groupName: string
  members: GroupMember[]
  selfMemberId: string
  selfDeviceId?: string
  ownerIdentityId?: string
  ownerDeviceId?: string
  onInvite: () => void
  onRemoveMember?: (memberId: string) => Promise<void>
  onUpdateMemberRole?: (memberId: string, role: GroupMemberRole) => Promise<void>
}) {
  const people = groupVisibleMembersByPerson(props.members, {
    identityId: props.ownerIdentityId,
    deviceId: props.ownerDeviceId,
  })
  const self = { identityId: props.selfMemberId, deviceId: props.selfDeviceId }
  const selfRole = resolveSelfMemberRole(props.members, self, {
    identityId: props.ownerIdentityId,
    deviceId: props.ownerDeviceId,
  })
  const canManage = Boolean(
    props.onRemoveMember &&
      props.onUpdateMemberRole &&
      canManageWorkspaceMembers(selfRole),
  )
  const [menuMember, setMenuMember] = useState<GroupMember | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const closeMenu = () => {
    if (actionBusy) return
    setMenuMember(null)
    setConfirmingRemove(false)
    setActionError(null)
  }

  const handleSelectRole = async (role: GroupMemberRole) => {
    if (!menuMember || !props.onUpdateMemberRole || menuMember.role === role) return
    setActionBusy(true)
    setActionError(null)
    try {
      await props.onUpdateMemberRole(menuMember.id, role)
      setMenuMember(null)
      setConfirmingRemove(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法更改成员角色')
    } finally {
      setActionBusy(false)
    }
  }

  const handleConfirmRemove = async () => {
    if (!menuMember || !props.onRemoveMember) return
    setActionBusy(true)
    setActionError(null)
    try {
      await props.onRemoveMember(menuMember.id)
      setMenuMember(null)
      setConfirmingRemove(false)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '无法移出该成员')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title="群组成员"
        subtitle={`${props.groupName} · ${people.length} 人`}
        actions={
          <Pressable
            onPress={props.onInvite}
            style={({ pressed }) => [styles.inviteBtn, pressed ? styles.inviteBtnPressed : null]}
          >
            <IconPlus size={14} color={colors.text} />
            <Text style={styles.inviteBtnText}>邀请成员</Text>
          </Pressable>
        }
      />
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {people.length === 0 ? (
          <Text style={styles.emptyText}>暂无成员</Text>
        ) : (
          people.map((person) => {
            const isSelf = person.devices.some((member) => isSelfGroupMember(member, self))
            const displayName = isSelf
              ? '我的'
              : resolvePeerMemberDisplayName(person.displayName)
            const avatarLabel = isSelf ? '我' : memberAvatarInitial(displayName)
            const manageable = canManage && canManageTargetPerson(selfRole, person, self)
            const target = person.devices.find((item) => item.status === 'active') ?? person.devices[0]
            return (
              <View key={person.key} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{avatarLabel}</Text>
                </View>
                <View style={styles.memberMeta}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {person.devices.map((member) => {
                    const online = member.status !== 'invited' && member.online
                    return (
                      <Text
                        key={member.deviceId}
                        style={[
                          styles.memberDevice,
                          online ? styles.memberDeviceOnline : null,
                          { color: online ? colors.online : colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {memberDevicePresenceLine(
                          member.deviceKind,
                          member.online,
                          member.status,
                        )}
                      </Text>
                    )
                  })}
                </View>
                <View style={styles.memberEnd}>
                  <Text
                    style={[
                      styles.memberRole,
                      person.role === 'owner' ? styles.memberRoleOwner : null,
                    ]}
                  >
                    {groupMemberRoleLabel(person.role)}
                  </Text>
                  {manageable && target ? (
                    <View style={styles.memberStatusRow}>
                      <Pressable
                        accessibilityLabel="管理成员"
                        disabled={actionBusy}
                        onPress={() => {
                          setMenuMember({ ...target, role: person.role, displayName })
                          setConfirmingRemove(false)
                          setActionError(null)
                        }}
                        style={({ pressed }) => [
                          styles.memberManageBtn,
                          pressed ? styles.memberManageBtnPressed : null,
                        ]}
                      >
                        <IconMoreHorizontal size={16} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
      {menuMember ? (
        <GroupMemberManageMenu
          member={menuMember}
          actorRole={selfRole}
          self={self}
          busy={actionBusy}
          error={actionError}
          confirmingRemove={confirmingRemove}
          onClose={closeMenu}
          onSelectRole={(role) => void handleSelectRole(role)}
          onRequestRemove={() => setConfirmingRemove(true)}
          onCancelRemove={() => setConfirmingRemove(false)}
          onConfirmRemove={() => void handleConfirmRemove()}
        />
      ) : null}
    </View>
  )
}
