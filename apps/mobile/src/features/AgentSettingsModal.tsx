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
import { AgentSettingsBasicTab } from './AgentSettingsBasicTab'
import { AgentSettingsExtraTabs } from './AgentSettingsExtraTabs'
import { agentSettingsModalStyles as styles } from './agentSettingsModalStyles'
import {
  AGENT_SETTINGS_TABS,
  useAgentSettingsModal,
  type AgentSettingsDraft,
  type AgentSettingsTab,
} from './useAgentSettingsModal'

type Props = {
  visible: boolean
  onClose: () => void
}

export function AgentSettingsModal({ visible, onClose }: Props) {
  const { width: dialogWidth, height: dialogHeight } = useSettingsModalSize()
  const { activeTab, setActiveTab, draft, titleName, updateDraft, handleSave } =
    useAgentSettingsModal(visible, onClose)

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
              <View style={styles.titleRow}>
                <View style={styles.titleDot} />
                <Text style={styles.title} numberOfLines={1}>
                  {titleName}设置
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="关闭">
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              <View style={styles.nav}>
                {AGENT_SETTINGS_TABS.map((tab) => {
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
                {draft ? <TabBody tab={activeTab} draft={draft} updateDraft={updateDraft} /> : null}
              </ScrollView>
            </View>

            <View style={styles.footer}>
              <Pressable onPress={onClose} style={[styles.footerBtn, styles.footerBtnSecondary]}>
                <Text style={styles.footerBtnSecondaryText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSave()}
                style={[styles.footerBtn, styles.footerBtnPrimary]}
              >
                <Text style={styles.footerBtnPrimaryText}>保存设置</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

function TabBody(props: {
  tab: AgentSettingsTab
  draft: AgentSettingsDraft
  updateDraft: (patch: Partial<AgentSettingsDraft>) => void
}) {
  const { tab, draft, updateDraft } = props
  if (tab === 'basic') {
    return <AgentSettingsBasicTab draft={draft} updateDraft={updateDraft} />
  }
  return <AgentSettingsExtraTabs tab={tab} draft={draft} updateDraft={updateDraft} />
}
