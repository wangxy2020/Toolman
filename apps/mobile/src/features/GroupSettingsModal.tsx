import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { colors } from '../theme'
import { useSettingsModalSize } from './settingsModalLayout'
import {
  GROUP_SETTINGS_TABS,
  useGroupSettingsModal,
  type GroupSettingsModalProps,
} from './useGroupSettingsModal'

export type { GroupSettingsModalProps }

export function GroupSettingsModal(props: GroupSettingsModalProps) {
  const { visible, group, memberCount, onClose, onDissolve } = props
  const { width: dialogWidth, height: dialogHeight } = useSettingsModalSize()
  const {
    activeTab,
    setActiveTab,
    name,
    changeName,
    description,
    setDescription,
    error,
    confirmDissolve,
    setConfirmDissolve,
    isDirty,
    handleSave,
  } = useGroupSettingsModal(props)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="关闭" />
        <View
          style={[styles.dialog, { width: dialogWidth, height: dialogHeight }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.header}>
            <View style={styles.heading}>
              <View style={styles.titleRow}>
                <View style={styles.titleDot} />
                <Text style={styles.title}>群组设置</Text>
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {group?.name ?? '未选择群组'} · {memberCount} 名成员
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="关闭" hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          {group ? (
            <>
              <View style={styles.body}>
                <View style={styles.nav}>
                  {GROUP_SETTINGS_TABS.map((tab) => {
                    const active = activeTab === tab.id
                    return (
                      <Pressable
                        key={tab.id}
                        onPress={() => setActiveTab(tab.id)}
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
                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  {activeTab === 'general' ? (
                    <View style={styles.form}>
                      <Text style={styles.sectionTitle}>常规设置</Text>
                      <Text style={styles.label}>
                        群组名称<Text style={styles.required}> *</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={changeName}
                        placeholder="输入群组名称"
                        placeholderTextColor={colors.textSecondary}
                        maxLength={100}
                      />
                      <Text style={styles.label}>描述</Text>
                      <TextInput
                        style={[styles.input, styles.textarea]}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="简要描述群组用途…"
                        placeholderTextColor={colors.textSecondary}
                        maxLength={500}
                        multiline
                      />
                    </View>
                  ) : null}

                  {activeTab === 'storage' ? (
                    <View style={styles.form}>
                      <Text style={styles.sectionTitle}>数据底座状态</Text>
                      <Text style={styles.label}>本地存储路径</Text>
                      <View style={styles.pathBox}>
                        <Text style={styles.pathText} numberOfLines={1}>
                          本机（移动端本地存储）
                        </Text>
                      </View>
                      <View style={styles.statGrid}>
                        <StatCard label="同步状态" value="空闲" idle />
                        <StatCard label="序号模式" value="—" />
                        <StatCard label="复制拓扑" value="—" />
                        <StatCard label="最新事件序号" value="—" mono />
                        <StatCard label="上次同步时间" value="—" muted />
                        <StatCard label="待同步文件" value="0" mono />
                      </View>
                      <Text style={styles.hint}>
                        本机已知的群组事件最大序号，用于成员间同步与排序；创建群组、分享资源等操作会递增。
                      </Text>
                      <Text style={styles.hint}>暂无已连接的对端设备。</Text>
                    </View>
                  ) : null}

                  {activeTab === 'danger' ? (
                    <View style={styles.form}>
                      <Text style={styles.sectionTitle}>危险操作</Text>
                      <View style={styles.dangerCard}>
                        <Text style={styles.hint}>
                          解散后将移除本机该群组的数据。此操作不可撤销。
                        </Text>
                        <Pressable
                          onPress={() => setConfirmDissolve(true)}
                          style={({ pressed }) => [
                            styles.dangerBtn,
                            pressed ? styles.dangerBtnPressed : null,
                          ]}
                        >
                          <Text style={styles.dangerBtnText}>解散群组</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </ScrollView>
              </View>

              <View style={styles.footer}>
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.footerBtn,
                    styles.footerBtnSecondary,
                    pressed ? styles.footerBtnPressed : null,
                  ]}
                >
                  <Text style={styles.footerBtnSecondaryText}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={!isDirty}
                  style={({ pressed }) => [
                    styles.footerBtn,
                    styles.footerBtnPrimary,
                    !isDirty ? styles.footerBtnDisabled : null,
                    pressed && isDirty ? styles.footerBtnPressed : null,
                  ]}
                >
                  <Text style={styles.footerBtnPrimaryText}>保存配置</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.emptyBody}>
              <Text style={styles.emptyTitle}>请先选择群组</Text>
              <Text style={styles.hint}>在左侧创建或选择一个群组后，即可查看该群组的设置。</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {confirmDissolve && group ? (
        <View style={styles.confirmOverlay} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setConfirmDissolve(false)}
            accessibilityLabel="取消"
          />
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>解散群组</Text>
            <Text style={styles.confirmMessage}>
              确定要解散「{group.name}」吗？此操作不可撤销，所有成员将失去访问权限。
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmDissolve(false)}
                style={({ pressed }) => [
                  styles.footerBtn,
                  styles.footerBtnSecondary,
                  pressed ? styles.footerBtnPressed : null,
                ]}
              >
                <Text style={styles.footerBtnSecondaryText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmDissolve(false)
                  onDissolve()
                }}
                style={({ pressed }) => [
                  styles.footerBtn,
                  styles.confirmDangerBtn,
                  pressed ? styles.footerBtnPressed : null,
                ]}
              >
                <Text style={styles.confirmDangerText}>解散群组</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      </View>
    </Modal>
  )
}

function StatCard(props: {
  label: string
  value: string
  idle?: boolean
  mono?: boolean
  muted?: boolean
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{props.label}</Text>
      <View style={styles.statValueRow}>
        {props.idle ? <View style={styles.statusDot} /> : null}
        <Text
          style={[
            styles.statValue,
            props.mono ? styles.statValueMono : null,
            props.muted ? styles.statValueMuted : null,
          ]}
        >
          {props.value}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    flexShrink: 0,
  },
  heading: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
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
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  nav: {
    width: 108,
    padding: 10,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navItemActive: {
    backgroundColor: colors.accentSoft,
    borderLeftColor: colors.accent,
  },
  navItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  navItemTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  contentInner: {
    padding: 16,
  },
  form: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  required: {
    color: colors.danger,
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  textarea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  pathBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.hover,
  },
  pathText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    borderRadius: 8,
    backgroundColor: colors.hover,
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statValueMono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  statValueMuted: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  error: {
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(220,38,38,0.08)',
    fontSize: 12,
    lineHeight: 17,
    color: colors.danger,
  },
  dangerCard: {
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.04)',
  },
  dangerBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 6,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dangerBtnPressed: {
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    flexShrink: 0,
  },
  footerBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: {
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
  footerBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  footerBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  emptyBody: {
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  confirmDialog: {
    borderRadius: 12,
    backgroundColor: colors.bg,
    padding: 18,
    gap: 10,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  confirmMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  confirmDangerBtn: {
    backgroundColor: colors.danger,
  },
  confirmDangerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
