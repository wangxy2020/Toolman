import { Pressable, ScrollView, Text, View } from 'react-native'
import { IconPlus } from '../icons/composer-icons'
import {
  groupMemberRoleLabel,
  type GroupMember,
} from '../storage/groupChat'
import { colors } from '../theme'
import { GroupPanelHeader } from './GroupPanelHeader'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'
import {
  groupVisibleMembersByPerson,
  isSelfGroupMember,
  memberAvatarInitial,
  memberDevicePresenceLine,
} from './groupPagePanelUtils'
import { resolvePeerMemberDisplayName } from '@toolman/shared'

export function GroupMembersPane(props: {
  groupName: string
  members: GroupMember[]
  selfMemberId: string
  selfDeviceId?: string
  ownerIdentityId?: string
  ownerDeviceId?: string
  onInvite: () => void
}) {
  const people = groupVisibleMembersByPerson(props.members, {
    identityId: props.ownerIdentityId,
    deviceId: props.ownerDeviceId,
  })
  const self = { identityId: props.selfMemberId, deviceId: props.selfDeviceId }

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
            return (
              <View key={person.key} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {avatarLabel}
                  </Text>
                </View>
                <View style={styles.memberMeta}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {person.devices.map((member) => (
                    <Text
                      key={member.deviceId}
                      style={[
                        styles.memberDevice,
                        member.status !== 'invited' && member.online
                          ? styles.memberDeviceOnline
                          : null,
                      ]}
                      numberOfLines={1}
                    >
                      {memberDevicePresenceLine(
                        member.deviceKind,
                        member.online,
                        member.status,
                      )}
                    </Text>
                  ))}
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
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}
