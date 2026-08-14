import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { IconPlus } from '../icons/composer-icons'
import {
  groupMemberRoleLabel,
  shortDeviceId,
  type GroupActivity,
  type GroupMember,
  type GroupSharedItem,
  type GroupSharedKind,
} from '../storage/groupChat'
import { colors } from '../theme'
import { formatActivityRelativeTime } from './groupActivity'
import {
  GroupResourcePickerModal,
  type GroupPickerGroup,
  type GroupPickerSelection,
} from './GroupResourcePickerModal'

export function GroupPanelHeader(props: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>{props.title}</Text>
        <Text style={styles.panelSubtitle}>{props.subtitle}</Text>
      </View>
      {props.actions}
    </View>
  )
}

export function GroupMembersPane(props: {
  groupName: string
  members: GroupMember[]
  selfMemberId: string
  onInvite: () => void
}) {
  const activeMembers = props.members.filter((member) => member.status === 'active')

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title="群组成员"
        subtitle={`${props.groupName} · ${activeMembers.length} 人`}
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
        {activeMembers.length === 0 ? (
          <Text style={styles.emptyText}>暂无成员</Text>
        ) : (
          activeMembers.map((member) => {
            const isSelf = member.id === props.selfMemberId
            return (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {(member.displayName.trim().slice(0, 1) || '?').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberMeta}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.displayName}
                    {isSelf ? <Text style={styles.memberYou}>（我）</Text> : null}
                  </Text>
                  <Text style={styles.memberDevice} numberOfLines={1}>
                    {shortDeviceId(member.deviceId)}
                  </Text>
                </View>
                <View style={styles.memberEnd}>
                  <Text
                    style={[
                      styles.memberRole,
                      member.role === 'owner' ? styles.memberRoleOwner : null,
                    ]}
                  >
                    {groupMemberRoleLabel(member.role)}
                  </Text>
                  <Text
                    style={[styles.memberStatus, member.online ? styles.memberStatusOnline : null]}
                  >
                    {member.online ? (isSelf ? '本机 · 在线' : '在线') : '离线'}
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

export function GroupSharedResourcePane(props: {
  kind: GroupSharedKind
  title: string
  typeNoun: string
  groupName: string
  items: GroupSharedItem[]
  pickerGroups: GroupPickerGroup[]
  onAdd: (selection: GroupPickerSelection[]) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const count = props.items.length

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title={props.title}
        subtitle={`${props.groupName} · ${count} 个${props.typeNoun}`}
      />
      <Pressable
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [styles.dropzone, pressed ? styles.dropzonePressed : null]}
      >
        <Text style={styles.dropTitle}>点击添加{props.typeNoun}到群组</Text>
        <Text style={styles.dropHint}>从已有{props.typeNoun}中选择，共享给群组成员</Text>
      </Pressable>
      <ScrollView
        style={styles.panelScroll}
        contentContainerStyle={styles.panelScrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {count === 0 ? (
          <Text style={styles.emptyText}>暂无群组{props.typeNoun}，点击上方区域添加</Text>
        ) : (
          props.items.map((item) => (
            <View key={`${item.kind}-${item.id}`} style={styles.sharedCard}>
              <Text style={styles.sharedName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.parentName ? (
                <Text style={styles.sharedMeta} numberOfLines={1}>
                  {item.parentName}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <GroupResourcePickerModal
        visible={pickerOpen}
        title={`选择${props.typeNoun}`}
        hint={
          props.kind === 'notes'
            ? '展开笔记本可查看笔记，勾选笔记本将全选其中笔记，也可单独勾选笔记。'
            : props.kind === 'knowledge'
              ? '展开知识库可查看未共享文档，勾选知识库将全选可添加文件，也可单独勾选文档。'
              : props.kind === 'agents'
                ? '展开智能体可查看未共享话题，勾选智能体或话题将添加到群组。'
                : '勾选要添加到群组的工作流。'
        }
        emptyLabel="暂无可添加的内容"
        groups={props.pickerGroups}
        onClose={() => setPickerOpen(false)}
        onConfirm={(selection) => {
          setPickerOpen(false)
          props.onAdd(selection)
        }}
      />
    </View>
  )
}

export function GroupActivityPane(props: {
  groupName: string
  events: GroupActivity[]
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const sorted = useMemo(
    () => [...props.events].sort((a, b) => b.timestamp - a.timestamp || b.seq - a.seq),
    [props.events],
  )

  return (
    <View style={styles.panelRoot}>
      <GroupPanelHeader
        title="群组活动记录"
        subtitle={`${props.groupName} · ${sorted.length} 条记录`}
      />
      {sorted.length === 0 ? (
        <View style={styles.activityEmpty}>
          <Text style={styles.emptyTitle}>暂无活动记录</Text>
          <Text style={styles.emptyHint}>创建群组、加入成员等操作会显示在这里</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelScrollContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {sorted.map((event) => (
            <View key={event.id} style={styles.activityCard}>
              <View style={styles.activityMain}>
                <Text style={styles.activityMessage}>{event.message}</Text>
                <Text style={styles.activityMeta}>
                  #{event.seq} · {event.resourceLabel}
                  {event.sourceDeviceId
                    ? ` · 来自 ${shortDeviceId(event.sourceDeviceId)}`
                    : ''}
                </Text>
              </View>
              <Text style={styles.activityTime}>
                {formatActivityRelativeTime(event.timestamp, now)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panelRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelHeading: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    color: colors.text,
  },
  panelSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    color: colors.textSecondary,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  inviteBtnPressed: {
    backgroundColor: colors.hover,
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  panelScroll: {
    flex: 1,
  },
  panelScrollContent: {
    gap: 8,
    paddingBottom: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  memberMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  memberYou: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  memberDevice: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  memberEnd: {
    alignItems: 'flex-end',
    gap: 4,
  },
  memberRole: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.hover,
    color: colors.textSecondary,
  },
  memberRoleOwner: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  memberStatus: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  memberStatusOnline: {
    color: colors.accent,
  },
  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.hover,
  },
  dropzonePressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dropTitle: {
    fontSize: 13,
    color: colors.text,
  },
  dropHint: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  sharedCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    gap: 4,
  },
  sharedName: {
    fontSize: 14,
    color: colors.text,
  },
  sharedMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  activityEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 200,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  activityMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  activityMessage: {
    fontSize: 14,
    color: colors.text,
  },
  activityMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  activityTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
})
