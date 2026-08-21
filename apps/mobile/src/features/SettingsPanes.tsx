import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native'
import { MOBILE_PROVIDER_PRESETS } from '../settings/provider-presets'
import { SETTINGS_TABS, SYSTEM_SETTINGS_SECTIONS, DEFAULT_SYSTEM_SECTION } from '../settings/tabs'
import { useI18n } from '../i18n'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import { IconEye } from '../icons/composer-icons'
import { AboutSettingsPanel } from './AboutSettingsPanel'
import { useAgentSettingsPanel } from './useAgentSettingsPanel'
import { DiagnosticsSettingsPanel } from './DiagnosticsSettingsPanel'
import { DisplaySettingsPanel } from './DisplaySettingsPanel'
import { GeneralSettingsPanel } from './GeneralSettingsPanel'
import { MemorySettingsPanel } from './MemorySettingsPanel'
import { QuickPhrasesSettingsPanel } from './QuickPhrasesSettingsPanel'
import { UserSettingsPanel } from './UserSettingsPanel'
import {
  Field,
  Section,
  SettingsScroll,
  Toggle,
  settingsUiStyles,
} from './settingsUi'
import { SidebarGroupLabel, SidebarItem, SidebarList, SidebarShell } from './sidebarUi'

export function SettingsLeftPane() {
  const { settingsTab, setSettingsTab } = useMobileApp()
  const { t } = useI18n()

  return (
    <SidebarShell>
      <SidebarList>
        {SETTINGS_TABS.map((tab) => (
          <SidebarItem
            key={tab.id}
            label={t(tab.labelKey)}
            active={settingsTab === tab.id}
            onPress={() => setSettingsTab(tab.id)}
          />
        ))}
        <SidebarGroupLabel
          label={t('settings.system')}
          onPress={() => setSettingsTab(DEFAULT_SYSTEM_SECTION)}
        />
        {SYSTEM_SETTINGS_SECTIONS.map((section) => (
          <SidebarItem
            key={section.id}
            nested
            label={t(section.labelKey)}
            active={settingsTab === section.id}
            onPress={() => setSettingsTab(section.id)}
          />
        ))}
      </SidebarList>
    </SidebarShell>
  )
}

export function SettingsRightPane() {
  const { settingsTab } = useMobileApp()
  switch (settingsTab) {
    case 'user':
      return <UserSettingsPanel />
    case 'agent':
      return <AgentSettingsPanel />
    case 'general':
      return <GeneralSettingsPanel />
    case 'display':
      return <DisplaySettingsPanel />
    case 'memory':
      return <MemorySettingsPanel />
    case 'quick-phrases':
      return <QuickPhrasesSettingsPanel />
    case 'diagnostics':
      return <DiagnosticsSettingsPanel />
    case 'about':
      return <AboutSettingsPanel />
    default:
      return <GeneralSettingsPanel />
  }
}

function AgentSettingsPanel() {
  const {
    providerId,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    model,
    setModel,
    localModelEnabled,
    setLocalModelEnabled,
    message,
    probeBusy,
    probeOk,
    showApiKey,
    setShowApiKey,
    prefs,
    preset,
    applyProvider,
    saveModel,
    runProbe,
    patchPrefs,
    trialActive,
    trialRemainingConversations,
    trialRemainingTokens,
  } = useAgentSettingsPanel()

  return (
    <SettingsScroll>
      <Section title="模型服务商">
        <View style={styles.providerGrid}>
          {MOBILE_PROVIDER_PRESETS.map((item) => {
            const active = providerId === item.id
            return (
              <Pressable
                key={item.id}
                style={[styles.providerChip, active ? styles.providerChipActive : null]}
                onPress={() => applyProvider(item.id)}
              >
                <Text
                  style={[styles.providerChipText, active ? styles.providerChipTextActive : null]}
                >
                  {item.name}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.hint}>
          对齐桌面端网络模型服务（OpenAI 兼容协议）。切换服务商会填充默认 Base URL 与推荐模型，各服务商的 API Key 独立保存。
        </Text>
      </Section>

      <Section title="API 模型">
        {trialActive ? (
          <Text style={styles.hint}>
            {trialRemainingConversations === 0 || trialRemainingTokens === 0
              ? '试用额度已用完。请在下方填写自己的 API Key 后继续。密钥由你自己保管，试用通道不会显示或复制平台密钥。'
              : `未填写密钥时使用试用模型 DeepSeek V4 Flash。硬顶：每月 20 万 token 或 50 次对话；速率：每分钟 3 次。本月剩余 ${trialRemainingConversations ?? '…'} 次对话 · ${trialRemainingTokens ?? '…'} token。试用密钥由程序托管，不可查看或复制。`}
          </Text>
        ) : null}
        <Field label="Base URL" value={baseUrl} onChangeText={setBaseUrl} />
        <Field
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry={!showApiKey}
          placeholder={trialActive ? '选填；留空则继续使用试用通道' : 'API 密钥'}
          right={
            <>
              <Pressable
                style={styles.fieldIconBtn}
                onPress={() => setShowApiKey((v) => !v)}
                hitSlop={8}
                accessibilityLabel={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                <IconEye size={18} color={colors.textSecondary} hidden={showApiKey} />
              </Pressable>
              <Pressable
                style={[styles.fieldDetectBtn, probeBusy ? styles.btnDisabled : null]}
                disabled={probeBusy}
                onPress={() => void runProbe()}
              >
                {probeBusy ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Text style={styles.btnSecondaryText}>检测</Text>
                )}
              </Pressable>
            </>
          }
        />
        {preset.apiKeyUrl ? (
          <Pressable onPress={() => void Linking.openURL(preset.apiKeyUrl!)}>
            <Text style={styles.linkText}>获取 / 管理 {preset.name} API Key →</Text>
          </Pressable>
        ) : null}
        <Field
          label="Model"
          value={model}
          onChangeText={setModel}
          placeholder={preset.defaultModel || '模型 ID'}
        />
        {preset.suggestedModels.length > 0 ? (
          <View style={styles.modelSuggestRow}>
            {preset.suggestedModels.map((id) => {
              const active = model === id
              return (
                <Pressable
                  key={id}
                  style={[styles.modelChip, active ? styles.modelChipActive : null]}
                  onPress={() => setModel(id)}
                >
                  <Text
                    style={[styles.modelChipText, active ? styles.modelChipTextActive : null]}
                    numberOfLines={1}
                  >
                    {id}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
        <Toggle
          label="本地小模型（辅，默认关）"
          value={localModelEnabled}
          onChange={setLocalModelEnabled}
        />
        <View style={styles.actionRow}>
          <Pressable style={[styles.btn, styles.actionBtn]} onPress={() => void saveModel()}>
            <Text style={styles.btnText}>保存模型</Text>
          </Pressable>
        </View>
      </Section>

      <Section title="对话默认项">
        <Toggle
          label="默认启用联网搜索"
          value={prefs.defaultWebSearch}
          onChange={(v) => void patchPrefs({ defaultWebSearch: v })}
        />
        <Toggle
          label="默认启用知识库"
          value={prefs.defaultKb}
          onChange={(v) => void patchPrefs({ defaultKb: v })}
        />
        <Toggle
          label="优先经桌面宿主调用"
          value={prefs.preferDesktopHost}
          onChange={(v) => void patchPrefs({ preferDesktopHost: v })}
        />
      </Section>

      {message ? (
        <Text
          style={[
            styles.hint,
            probeOk === true ? styles.hintOk : null,
            probeOk === false ? styles.hintError : null,
          ]}
        >
          {message}
        </Text>
      ) : null}
    </SettingsScroll>
  )
}


const styles = settingsUiStyles
