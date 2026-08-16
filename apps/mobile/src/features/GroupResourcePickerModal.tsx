import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { groupResourcePickerStyles as styles } from './GroupResourcePickerModal.styles'
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
