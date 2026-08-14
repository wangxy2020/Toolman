import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'
import {
  getProjectMenu,
  useOptionalProjectUi,
} from './ProjectPanes'
import { SettingsDialogFrame } from './SettingsDialogFrame'

type Props = {
  visible: boolean
  onClose: () => void
}

export function ProjectSettingsModal({ visible, onClose }: Props) {
  const projectUi = useOptionalProjectUi()
  const preferences = projectUi?.preferences
  const hidden = new Set(preferences?.hidden ?? [])
  const visibleCount = preferences?.order.filter((key) => !hidden.has(key)).length ?? 0

  return (
    <SettingsDialogFrame
      visible={visible}
      title="项目设置"
      tabs={[{ id: 'menus', label: '侧栏菜单' }]}
      activeTab="menus"
      onTabChange={() => undefined}
      onClose={onClose}
      closeLabel="关闭"
    >
      {!projectUi || !preferences ? (
        <Text style={styles.hint}>打开项目页面后可配置左侧菜单。</Text>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            菜单项（{visibleCount}/{preferences.order.length} 项显示）
          </Text>
          {preferences.order.map((key, index) => {
            const menu = getProjectMenu(key)
            const itemVisible = !hidden.has(key)
            return (
              <View key={key} style={styles.row}>
                <Text style={styles.label} numberOfLines={1}>
                  {menu.label}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => projectUi.setMenuVisible(key, !itemVisible)}
                    style={[styles.chip, itemVisible ? styles.chipOn : null]}
                  >
                    <Text style={[styles.chipText, itemVisible ? styles.chipTextOn : null]}>
                      {itemVisible ? '显示' : '隐藏'}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={index === 0}
                    onPress={() => projectUi.moveMenu(key, 'up')}
                    style={[styles.chip, index === 0 ? styles.chipDisabled : null]}
                  >
                    <Text style={styles.chipText}>上移</Text>
                  </Pressable>
                  <Pressable
                    disabled={index === preferences.order.length - 1}
                    onPress={() => projectUi.moveMenu(key, 'down')}
                    style={[
                      styles.chip,
                      index === preferences.order.length - 1 ? styles.chipDisabled : null,
                    ]}
                  >
                    <Text style={styles.chipText}>下移</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}
          <Pressable onPress={projectUi.resetMenus} style={styles.resetBtn}>
            <Text style={styles.resetBtnText}>恢复默认</Text>
          </Pressable>
          <Text style={styles.hint}>
            隐藏后的菜单不会在左侧显示。完整编辑与数据库同步请使用桌面端项目管理。
          </Text>
        </>
      )}
    </SettingsDialogFrame>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  row: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.hover,
  },
  chipOn: {
    backgroundColor: colors.accentSoft,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextOn: {
    color: colors.accent,
    fontWeight: '600',
  },
  resetBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  resetBtnText: {
    fontSize: 13,
    color: colors.text,
  },
})
