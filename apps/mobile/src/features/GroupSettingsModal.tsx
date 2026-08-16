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
import { useSettingsModalSize } from './settingsModalLayout'
import {
  GROUP_SETTINGS_TABS,
  useGroupSettingsModal,
  type GroupSettingsModalProps,
} from './useGroupSettingsModal'
import { styles } from './GroupSettingsModal.styles'
import {
  GroupSettingsDangerSection,
  GroupSettingsDissolveConfirm,
  GroupSettingsGeneralSection,
  GroupSettingsStorageSection,
} from './GroupSettingsModalSections'

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
                      <GroupSettingsGeneralSection
                        name={name}
                        description={description}
                        changeName={changeName}
                        setDescription={setDescription}
                      />
                    ) : null}
                    {activeTab === 'storage' ? <GroupSettingsStorageSection /> : null}
                    {activeTab === 'danger' ? (
                      <GroupSettingsDangerSection onRequestDissolve={() => setConfirmDissolve(true)} />
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
          <GroupSettingsDissolveConfirm
            groupName={group.name}
            onCancel={() => setConfirmDissolve(false)}
            onConfirm={() => {
              setConfirmDissolve(false)
              onDissolve()
            }}
          />
        ) : null}
      </View>
    </Modal>
  )
}
