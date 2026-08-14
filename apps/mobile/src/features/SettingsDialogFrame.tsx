import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors } from '../theme'
import { useSettingsModalSize } from './settingsModalLayout'

type Tab = { id: string; label: string }

type Props = {
  visible: boolean
  title: string
  subtitle?: string
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
  onClose: () => void
  onSave?: () => void
  saveLabel?: string
  closeLabel?: string
  children: ReactNode
}

export function SettingsDialogFrame(props: Props) {
  const { width, height } = useSettingsModalSize()
  const closeLabel = props.closeLabel ?? (props.onSave ? '取消' : '关闭')

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.modalRoot}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} accessibilityLabel="关闭" />
          <View
            style={[styles.dialog, { width, height }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
            <View style={styles.heading}>
              <View style={styles.titleRow}>
                <View style={styles.titleDot} />
                <Text style={styles.title} numberOfLines={1}>
                  {props.title}
                </Text>
              </View>
              {props.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {props.subtitle}
                </Text>
              ) : null}
            </View>
              <Pressable onPress={props.onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              <View style={styles.nav}>
                {props.tabs.map((tab) => {
                  const active = props.activeTab === tab.id
                  return (
                    <Pressable
                      key={tab.id}
                      onPress={() => props.onTabChange(tab.id)}
                      style={[styles.navItem, active ? styles.navItemActive : null]}
                    >
                      <Text style={[styles.navItemText, active ? styles.navItemTextActive : null]}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentInner}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                {props.children}
              </ScrollView>
            </View>

            <View style={styles.footer}>
              <Pressable onPress={props.onClose} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                <Text style={styles.footerBtnSecondaryText}>{closeLabel}</Text>
              </Pressable>
              {props.onSave ? (
                <Pressable onPress={props.onSave} style={[styles.footerBtn, styles.footerBtnPrimary]}>
                  <Text style={styles.footerBtnPrimaryText}>{props.saveLabel ?? '保存'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    flexDirection: 'column',
    flexShrink: 0,
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    flexShrink: 0,
  },
  heading: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  titleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  subtitle: { marginTop: 2, marginLeft: 16, fontSize: 12, color: colors.textSecondary },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  nav: {
    width: 160,
    padding: 12,
    gap: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.borderLight,
    backgroundColor: '#fafafa',
    flexShrink: 0,
  },
  navItem: {
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navItemActive: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  navItemText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  navItemTextActive: { color: colors.accent, fontWeight: '600' },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
  contentInner: { padding: 24, gap: 12 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    backgroundColor: '#fafafa',
    flexShrink: 0,
  },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: { backgroundColor: colors.hover },
  footerBtnPrimary: { backgroundColor: colors.accent },
  footerBtnSecondaryText: { fontSize: 13, fontWeight: '500', color: colors.text },
  footerBtnPrimaryText: { fontSize: 13, fontWeight: '600', color: '#fff' },
})
