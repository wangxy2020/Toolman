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
import { CURATED_EDGE_TTS_VOICES } from '../voice'
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
    apiKeyDescription,
    patchTtsVoice,
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
          对齐桌面端网络模型服务（OpenAI 兼容协议）。切换服务商会填充默认 Base URL 与推荐模型。
        </Text>
      </Section>

      <Section title="API 模型">
        <Field label="Base URL" value={baseUrl} onChangeText={setBaseUrl} />
        <Field
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry={!showApiKey}
        />
        <View style={styles.keyMetaRow}>
          <Text style={styles.hint}>{apiKeyDescription}</Text>
          <Pressable onPress={() => setShowApiKey((v) => !v)} hitSlop={8}>
            <Text style={styles.linkText}>{showApiKey ? '隐藏' : '显示'}</Text>
          </Pressable>
        </View>
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
          <Pressable
            style={[styles.btnSecondary, styles.actionBtn, probeBusy ? styles.btnDisabled : null]}
            disabled={probeBusy}
            onPress={() => void runProbe()}
          >
            {probeBusy ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.btnSecondaryText}>检测配置</Text>
            )}
          </Pressable>
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

      <Section title="语音（朗读）">
        <Text style={styles.hint}>
          与桌面一致：默认使用微软 Edge 神经语音（无需 API Key）。部分浏览器受限时会自动回退系统语音。
        </Text>
        <Toggle
          label="自动朗读回复"
          value={prefs.autoSpeak}
          onChange={(v) => void patchPrefs({ autoSpeak: v })}
        />
        <Text style={styles.hint}>
          开启后，智能体生成回答结束时自动朗读（默认开启；仍可在消息底部手动播放）。
        </Text>
        <Text style={styles.label}>引擎</Text>
        <View style={styles.providerGrid}>
          {(
            [
              { id: 'edge' as const, label: '微软 Edge 神经语音' },
              { id: 'web-speech' as const, label: '系统语音' },
            ] as const
          ).map((item) => {
            const active = prefs.ttsEngine === item.id
            return (
              <Pressable
                key={item.id}
                style={[styles.providerChip, active ? styles.providerChipActive : null]}
                onPress={() => void patchPrefs({ ttsEngine: item.id })}
              >
                <Text
                  style={[styles.providerChipText, active ? styles.providerChipTextActive : null]}
                >
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {prefs.ttsEngine === 'edge' ? (
          <>
            <Text style={styles.label}>音色</Text>
            <View style={styles.modelSuggestRow}>
              {CURATED_EDGE_TTS_VOICES.map((item) => {
                const active = prefs.ttsVoice === item.value
                return (
                  <Pressable
                    key={item.value}
                    style={[styles.modelChip, active ? styles.modelChipActive : null]}
                    onPress={() => patchTtsVoice(item.value)}
                  >
                    <Text
                      style={[styles.modelChipText, active ? styles.modelChipTextActive : null]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        ) : (
          <Text style={styles.hint}>系统语音使用设备内置朗读，音色由系统决定。</Text>
        )}
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
