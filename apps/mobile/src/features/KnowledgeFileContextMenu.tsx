import { useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { colors } from '../theme'

export type MobileSyncMoveTarget = { type: 'default' } | { type: 'kb'; kbId: string; name: string }

export type KnowledgeFileContextMenuProps = {
  visible: boolean
  x: number
  y: number
  selectedCount: number
  documentCount: number
  syncMoveTargets: Array<{ id: string; name: string }>
  onClose: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onReindexAll: () => void
  onMoveToSync: (target: MobileSyncMoveTarget) => void
}

export function KnowledgeFileContextMenu({
  visible,
  x,
  y,
  selectedCount,
  documentCount,
  syncMoveTargets,
  onClose,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onReindexAll,
  onMoveToSync,
}: KnowledgeFileContextMenuProps) {
  const { width, height } = useWindowDimensions()
  const [syncOpen, setSyncOpen] = useState(false)

  useEffect(() => {
    if (!visible) setSyncOpen(false)
  }, [visible])

  if (!visible || documentCount === 0) return null

  const menuWidth = 220
  const left = Math.min(Math.max(8, x), Math.max(8, width - menuWidth - 8))
  const top = Math.min(Math.max(8, y), Math.max(8, height - 320))
  const noneSelected = selectedCount === 0

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭菜单" />
        <View style={[styles.menu, { top, left, width: menuWidth }]} role="menu">
          <MenuItem
            label="全选"
            onPress={() => {
              onSelectAll()
              onClose()
            }}
          />
          <MenuItem
            label="取消"
            disabled={noneSelected}
            onPress={() => {
              if (noneSelected) return
              onClearSelection()
              onClose()
            }}
          />
          <MenuItem
            label={selectedCount > 0 ? `删除已勾选 (${selectedCount})` : '删除已勾选'}
            danger
            disabled={noneSelected}
            onPress={() => {
              if (noneSelected) return
              onDeleteSelected()
              onClose()
            }}
          />
          <MenuItem
            label="移动到同步知识库"
            submenu
            disabled={noneSelected}
            onPress={() => {
              if (noneSelected) return
              setSyncOpen((open) => !open)
            }}
          />
          {syncOpen && !noneSelected ? (
            <View style={styles.submenu}>
              <MenuItem
                label="默认文件夹"
                nested
                onPress={() => {
                  onMoveToSync({ type: 'default' })
                  onClose()
                }}
              />
              {syncMoveTargets.map((kb) => (
                <MenuItem
                  key={kb.id}
                  label={kb.name}
                  nested
                  onPress={() => {
                    onMoveToSync({ type: 'kb', kbId: kb.id, name: kb.name })
                    onClose()
                  }}
                />
              ))}
              {syncMoveTargets.length === 0 ? (
                <Text style={styles.empty}>暂无同步知识库</Text>
              ) : null}
            </View>
          ) : null}
          <MenuItem
            label="全部重建索引"
            last
            onPress={() => {
              onReindexAll()
              onClose()
            }}
          />
        </View>
      </View>
    </Modal>
  )
}

function MenuItem(props: {
  label: string
  onPress: () => void
  disabled?: boolean
  danger?: boolean
  submenu?: boolean
  nested?: boolean
  last?: boolean
}) {
  return (
    <Pressable
      role="menuitem"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.item,
        props.nested ? styles.itemNested : null,
        !props.last ? styles.itemBorder : null,
        pressed && !props.disabled ? styles.itemPressed : null,
        props.disabled ? styles.itemDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.itemLabel,
          props.danger ? styles.itemDanger : null,
          props.disabled ? styles.itemLabelDisabled : null,
        ]}
        numberOfLines={1}
      >
        {props.label}
      </Text>
      {props.submenu ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
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
  submenu: {
    backgroundColor: colors.inputBg,
  },
  item: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  itemNested: {
    paddingLeft: 24,
  },
  itemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  itemPressed: {
    backgroundColor: colors.hover,
  },
  itemDisabled: {
    opacity: 0.45,
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  itemDanger: {
    color: colors.danger,
  },
  itemLabelDisabled: {
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    fontSize: 12,
    color: colors.textSecondary,
  },
})
