import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GroupMember, GroupMemberRole } from '../storage/groupChat'
import { groupMemberRoleLabel } from '../storage/groupChat'
import { colors } from '../theme'
import { getAssignableMemberRoles } from './groupPagePanelUtils'

export function GroupMemberManageMenu(props: {
  member: GroupMember
  actorRole: GroupMemberRole | undefined
  self: { identityId?: string | null; deviceId?: string | null }
  busy: boolean
  error: string | null
  confirmingRemove: boolean
  onClose: () => void
  onSelectRole: (role: GroupMemberRole) => void
  onRequestRemove: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
}) {
  const assignable = getAssignableMemberRoles(props.actorRole, props.member, props.self)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.menu} accessibilityRole="menu">
          {props.confirmingRemove ? (
            <>
              <Text style={styles.confirmTitle}>移出群组</Text>
              <Text style={styles.confirmBody}>
                {`确定将 ${props.member.displayName} 移出群组？其所有设备都会被移除。`}
              </Text>
              {props.error ? <Text style={styles.error}>{props.error}</Text> : null}
              <Pressable
                disabled={props.busy}
                onPress={props.onConfirmRemove}
                style={({ pressed }) => [
                  styles.menuItem,
                  styles.menuItemBorder,
                  pressed ? styles.menuItemPressed : null,
                ]}
              >
                <Text style={styles.danger}>{props.busy ? '处理中…' : '移出群组'}</Text>
              </Pressable>
              <Pressable
                disabled={props.busy}
                onPress={props.onCancelRemove}
                style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
              >
                <Text style={styles.label}>取消</Text>
              </Pressable>
            </>
          ) : (
            <>
              {assignable.map((role) => {
                const active = props.member.role === role
                return (
                  <Pressable
                    key={role}
                    disabled={props.busy || active}
                    onPress={() => props.onSelectRole(role)}
                    style={({ pressed }) => [
                      styles.menuItem,
                      styles.menuItemBorder,
                      pressed && !active ? styles.menuItemPressed : null,
                    ]}
                  >
                    <Text style={[styles.label, active ? styles.active : null]}>
                      {`设为${groupMemberRoleLabel(role)}`}
                      {active ? ' · 当前' : ''}
                    </Text>
                  </Pressable>
                )
              })}
              {props.error ? <Text style={styles.error}>{props.error}</Text> : null}
              <Pressable
                disabled={props.busy}
                onPress={props.onRequestRemove}
                style={({ pressed }) => [styles.menuItem, pressed ? styles.menuItemPressed : null]}
              >
                <Text style={styles.danger}>移出群组</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  menu: {
    alignSelf: 'center',
    minWidth: 220,
    maxWidth: 320,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bg,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  menuItemPressed: {
    backgroundColor: colors.hover,
  },
  label: {
    fontSize: 14,
    color: colors.text,
  },
  active: {
    color: colors.textSecondary,
  },
  danger: {
    fontSize: 14,
    color: colors.danger,
  },
  confirmTitle: {
    paddingHorizontal: 14,
    paddingTop: 14,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  confirmBody: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  error: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    fontSize: 12,
    color: colors.danger,
  },
})
