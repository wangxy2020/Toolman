import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import { useGroupResourcePickerModal } from './useGroupResourcePickerModal'

export type GroupPickerItem = {
  id: string
  name: string
}

export type GroupPickerGroup = {
  id: string
  name: string
  items: GroupPickerItem[]
}

export type GroupPickerSelection = {
  groupId: string
  groupName: string
  items: GroupPickerItem[]
}

type Props = {
  visible: boolean
  title: string
  hint: string
  emptyLabel: string
  groups: GroupPickerGroup[]
  onClose: () => void
  onConfirm: (selection: GroupPickerSelection[]) => void
}

export function GroupResourcePickerModal(props: Props) {
  const { visible, title, hint, emptyLabel, groups } = props
  const {
    selectionCount,
    handleClose,
    toggleExpanded,
    toggleGroup,
    toggleItem,
    handleConfirm,
    groupState,
    isItemChecked,
  } = useGroupResourcePickerModal(props)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="关闭" />
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={handleClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <Text style={styles.hint}>{hint}</Text>
            {groups.length === 0 ? (
              <Text style={styles.empty}>{emptyLabel}</Text>
            ) : (
              groups.map((group) => {
                const { open, groupChecked, partial } = groupState(group)
                return (
                  <View key={group.id} style={styles.group}>
                    <View style={styles.groupRow}>
                      <Pressable onPress={() => toggleGroup(group)} style={styles.checkHit} hitSlop={6}>
                        <View
                          style={[
                            styles.check,
                            groupChecked ? styles.checkOn : null,
                            partial ? styles.checkPartial : null,
                          ]}
                        >
                          {groupChecked ? <Text style={styles.checkMark}>✓</Text> : null}
                          {partial && !groupChecked ? <View style={styles.checkDash} /> : null}
                        </View>
                      </Pressable>
                      <Pressable onPress={() => toggleExpanded(group.id)} style={styles.groupNameHit}>
                        <Text style={styles.groupName} numberOfLines={1}>
                          {group.name}
                        </Text>
                        <Text style={styles.groupMeta}>
                          {group.items.length > 0
                            ? `${group.items.length} 个子项`
                            : open
                              ? '收起'
                              : '展开'}
                        </Text>
                      </Pressable>
                    </View>
                    {open && group.items.length > 0
                      ? group.items.map((item) => {
                          const checked = isItemChecked(group.id, item.id)
                          return (
                            <Pressable
                              key={item.id}
                              onPress={() => toggleItem(group.id, item.id)}
                              style={styles.itemRow}
                            >
                              <View style={[styles.check, checked ? styles.checkOn : null]}>
                                {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                              </View>
                              <Text style={styles.itemName} numberOfLines={1}>
                                {item.name}
                              </Text>
                            </Pressable>
                          )
                        })
                      : null}
                    {open && group.items.length === 0 ? (
                      <Text style={styles.noItems}>暂无子项</Text>
                    ) : null}
                  </View>
                )
              })
            )}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnGhost,
                pressed ? styles.footerBtnPressed : null,
              ]}
            >
              <Text style={styles.footerBtnGhostText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={selectionCount === 0}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnPrimary,
                selectionCount === 0 ? styles.footerBtnDisabled : null,
                pressed && selectionCount > 0 ? styles.footerBtnPressed : null,
              ]}
            >
              <Text style={styles.footerBtnPrimaryText}>
                {selectionCount > 0 ? `添加 (${selectionCount})` : '添加'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  dialog: {
    maxHeight: '86%',
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  body: {
    maxHeight: 380,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
  },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.hover,
  },
  checkHit: {
    padding: 2,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#b5b7bb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  checkOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkPartial: {
    borderColor: colors.accent,
  },
  checkMark: {
    fontSize: 12,
    lineHeight: 14,
    color: '#fff',
    fontWeight: '700',
  },
  checkDash: {
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  groupNameHit: {
    flex: 1,
    minWidth: 0,
  },
  groupName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  groupMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 18,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  noItems: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnGhost: {
    backgroundColor: colors.hover,
  },
  footerBtnPrimary: {
    backgroundColor: colors.accent,
  },
  footerBtnPressed: {
    opacity: 0.88,
  },
  footerBtnDisabled: {
    opacity: 0.45,
  },
  footerBtnGhostText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  footerBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
