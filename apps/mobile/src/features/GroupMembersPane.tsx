import { Pressable, ScrollView, Text, View } from 'react-native'
import { IconPlus } from '../icons/composer-icons'
import {
  groupMemberRoleLabel,
  shortDeviceId,
  type GroupMember,
} from '../storage/groupChat'
import { colors } from '../theme'
import { GroupPanelHeader } from './GroupPanelHeader'
import { groupPagePanelStyles as styles } from './groupPagePanelStyles'
import {
  groupVisibleMembersByPerson,
  isSelfGroupMember,
  memberAvatarInitial,
  memberDeviceLine,
  memberOnlineLabel,
} from './groupPagePanelUtils'

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
            return (
              <View key={person.key} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {memberAvatarInitial(person.displayName)}
                  </Text>
                </View>
                <View style={styles.memberMeta}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {person.displayName}
                    {isSelf ? <Text style={styles.memberYou}>（我）</Text> : null}
                  </Text>
                  {person.devices.map((member) => (
                    <Text
                      key={member.deviceId}
                      style={[
                        styles.memberDevice,
                        member.online ? styles.memberDeviceOnline : null,
                      ]}
                      numberOfLines={1}
                    >
                      {memberDeviceLine(member.deviceKind, member.deviceId, shortDeviceId)}
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
                  <Text
                    style={[
                      styles.memberStatus,
                      person.status === 'invited'
                        ? null
                        : person.online
                          ? styles.memberStatusOnline
                          : null,
                    ]}
                  >
                    {person.status === 'invited'
                      ? '待加入'
                      : memberOnlineLabel(person.online)}
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
