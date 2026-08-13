import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors } from '../theme'

export type ChatMessageMenuItem = {
  id: string
  label: string
  danger?: boolean
  onPress: () => void
}

export function ChatMessageContextMenu(props: {
  visible: boolean
  x: number
  y: number
  items: ChatMessageMenuItem[]
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()
  if (!props.visible || props.items.length === 0) return null

  const menuWidth = 180
  const left = Math.min(Math.max(8, props.x), Math.max(8, width - menuWidth - 8))
  const top = Math.min(Math.max(8, props.y), Math.max(8, height - 52 * props.items.length - 16))

  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={props.onClose}
          accessibilityLabel="关闭菜单"
        />
        <View style={[styles.menu, { top, left, width: menuWidth }]} role="menu">
          {props.items.map((item, index) => (
            <Pressable
              key={item.id}
              role="menuitem"
              onPress={() => {
                item.onPress()
                props.onClose()
              }}
              style={({ pressed }) => [
                styles.item,
                index < props.items.length - 1 ? styles.itemBorder : null,
                pressed ? styles.itemPressed : null,
              ]}
            >
              <Text style={[styles.itemLabel, item.danger ? styles.itemDanger : null]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
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
  item: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  itemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  itemPressed: {
    backgroundColor: colors.hover,
  },
  itemLabel: {
    fontSize: 14,
    color: colors.text,
  },
  itemDanger: {
    color: colors.danger,
  },
})
