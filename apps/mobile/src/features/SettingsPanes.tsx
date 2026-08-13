import { useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native'
import { probeModelApi } from '../chat/probeModel'
import { saveModelConfig } from '../storage/secure'
import { saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import {
  getProviderPreset,
  MOBILE_PROVIDER_PRESETS,
  normalizeChatBaseUrl,
  type MobileProviderId,
} from '../settings/provider-presets'
import { sanitizeApiKey } from '../chat/apiHeaders'
import { SETTINGS_TABS } from '../settings/tabs'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import {
  CURATED_EDGE_TTS_VOICES,
  resolveCuratedEdgeTtsVoice,
} from '../voice'
import { UserSettingsPanel } from './UserSettingsPanel'
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Section,
  SettingsScroll,
  Toggle,
  settingsUiStyles,
} from './settingsUi'
import { SidebarItem, SidebarList, SidebarShell } from './sidebarUi'

function describeApiKey(raw: string): string {
  const key = sanitizeApiKey(raw)
  if (!key) return '未填写'
  const tail = key.length >= 4 ? key.slice(-4) : key
  const prefixOk = key.startsWith('sk-')
  return `长度 ${key.length} · 尾号 ****${tail}${prefixOk ? '' : ' · 警告：DeepSeek Key 通常以 sk- 开头'}`
}

export function SettingsLeftPane() {
  const { settingsTab, setSettingsTab } = useMobileApp()

  return (
    <SidebarShell>
      <SidebarList>
        {SETTINGS_TABS.map((tab) => (
          <SidebarItem
            key={tab.id}
            label={tab.label}
            active={settingsTab === tab.id}
            onPress={() => setSettingsTab(tab.id)}
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
    case 'knowledge':
      return <KnowledgeSettingsPanel />
    case 'notes':
      return <NotesSettingsPanel />
    case 'group':
      return <GroupSettingsPanel />
    case 'community':
      return <CommunitySettingsPanel />
    case 'classroom':
      return <ClassroomSettingsPanel />
    case 'projects':
      return <ProjectsSettingsPanel />
    case 'system':
      return <SystemSettingsPanel />
    default:
      return null
  }
}

function AgentSettingsPanel() {
  const { modelConfig, setModelConfig, modulePrefs, setModulePrefs } = useMobileApp()
  const [providerId, setProviderId] = useState<MobileProviderId>(
    (modelConfig.providerId as MobileProviderId) || 'deepseek',
  )
  const [baseUrl, setBaseUrl] = useState(modelConfig.baseUrl)
  const [apiKey, setApiKey] = useState(modelConfig.apiKey)
  const [model, setModel] = useState(modelConfig.model)
  const [localModelEnabled, setLocalModelEnabled] = useState(modelConfig.localModelEnabled)
  const [message, setMessage] = useState<string | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeOk, setProbeOk] = useState<boolean | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const prefs = modulePrefs.agent
  const preset = getProviderPreset(providerId)

  const applyProvider = (id: MobileProviderId) => {
    const next = getProviderPreset(id)
    setProviderId(id)
    setBaseUrl(next.defaultBaseUrl)
    if (next.defaultModel) setModel(next.defaultModel)
    setProbeOk(null)
  }

  const buildDraftConfig = () => ({
    providerId,
    baseUrl: normalizeChatBaseUrl(baseUrl.trim(), providerId),
    apiKey: sanitizeApiKey(apiKey),
    model: model.trim() || preset.defaultModel,
    localModelEnabled,
  })

  const saveModel = async () => {
    const next = buildDraftConfig()
    await saveModelConfig(next)
    setModelConfig(next)
    setBaseUrl(next.baseUrl)
    setModel(next.model)
    setMessage(`已保存 · ${preset.name}`)
  }

  const runProbe = async () => {
    setProbeBusy(true)
    setProbeOk(null)
    const draft = buildDraftConfig()
    setMessage(`正在检测…（${describeApiKey(draft.apiKey)}）`)
    const result = await probeModelApi(draft)
    setProbeBusy(false)
    setProbeOk(result.ok)
    setMessage(
      result.ok
        ? result.message
        : `${result.message}\n当前 Key：${describeApiKey(draft.apiKey)}。若尾号与控制台不一致，请清空后重新粘贴完整密钥并先「保存模型」。`,
    )
  }

  const patchPrefs = async (patch: Partial<ModulePrefs['agent']>) => {
    const next = { ...modulePrefs, agent: { ...prefs, ...patch } }
    setModulePrefs(next)
    await saveModulePrefs(next)
    setMessage('智能体偏好已保存')
  }

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

      <Section title="API 大模型">
        <Field label="Base URL" value={baseUrl} onChangeText={setBaseUrl} />
        <Field
          label="API Key"
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry={!showApiKey}
        />
        <View style={styles.keyMetaRow}>
          <Text style={styles.hint}>{describeApiKey(apiKey)}</Text>
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
                    onPress={() =>
                      void patchPrefs({ ttsVoice: resolveCuratedEdgeTtsVoice(item.value) })
                    }
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


function KnowledgeSettingsPanel() {
  const { modulePrefs, setModulePrefs } = useMobileApp()
  const prefs = modulePrefs.knowledge
  const [message, setMessage] = useState<string | null>(null)

  const patch = async (patch: Partial<ModulePrefs['knowledge']>) => {
    const next = { ...modulePrefs, knowledge: { ...prefs, ...patch } }
    setModulePrefs(next)
    await saveModulePrefs(next)
    setMessage('知识库设置已保存')
  }

  return (
    <SettingsScroll>
      <Section title="同步与索引">
        <Toggle
          label="同步知识库索引元数据"
          value={prefs.syncEnabled}
          onChange={(v) => void patch({ syncEnabled: v })}
        />
        <Toggle
          label="索引/上传优先桌面"
          value={prefs.preferDesktopIndex}
          onChange={(v) => void patch({ preferDesktopIndex: v })}
        />
      </Section>
      <Text style={styles.hint}>检索问答使用智能体页已配置的 API 模型。</Text>
      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}

function NotesSettingsPanel() {
  const { modulePrefs, setModulePrefs } = useMobileApp()
  const prefs = modulePrefs.notes
  const [message, setMessage] = useState<string | null>(null)

  const patch = async (patch: Partial<ModulePrefs['notes']>) => {
    const next = { ...modulePrefs, notes: { ...prefs, ...patch } }
    setModulePrefs(next)
    await saveModulePrefs(next)
    setMessage('笔记设置已保存')
  }

  return (
    <SettingsScroll>
      <Section title="同步">
        <Toggle
          label="启用笔记同步"
          value={prefs.syncEnabled}
          onChange={(v) => void patch({ syncEnabled: v })}
        />
        <Toggle
          label="编辑后自动纳入同步队列"
          value={prefs.autoSyncOnEdit}
          onChange={(v) => void patch({ autoSyncOnEdit: v })}
        />
      </Section>
      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}

function GroupSettingsPanel() {
  return <HostBridgePanel prefsKey="group" />
}

function ClassroomSettingsPanel() {
  return <HostBridgePanel prefsKey="classroom" />
}

function ProjectsSettingsPanel() {
  return <HostBridgePanel prefsKey="projects" />
}

function HostBridgePanel(props: {
  prefsKey: 'group' | 'classroom' | 'projects'
}) {
  const { modulePrefs, setModulePrefs, desktopHostsOnline } = useMobileApp()
  const prefs = modulePrefs[props.prefsKey]
  const [message, setMessage] = useState<string | null>(null)

  const patch = async (preferDesktopHost: boolean) => {
    const next = {
      ...modulePrefs,
      [props.prefsKey]: { preferDesktopHost },
    }
    setModulePrefs(next)
    await saveModulePrefs(next)
    setMessage('设置已保存')
  }

  return (
    <SettingsScroll>
      <Section title="桌面宿主">
        <Text style={styles.meta}>
          当前在线宿主：{desktopHostsOnline > 0 ? desktopHostsOnline : '无'}
        </Text>
        <Toggle
          label="优先经桌面宿主调用"
          value={prefs.preferDesktopHost}
          onChange={(v) => void patch(v)}
        />
      </Section>
      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}

function CommunitySettingsPanel() {
  const { modulePrefs, setModulePrefs } = useMobileApp()
  const prefs = modulePrefs.community
  const [hubBaseUrl, setHubBaseUrl] = useState(prefs.hubBaseUrl)
  const [message, setMessage] = useState<string | null>(null)

  const save = async (patch: Partial<ModulePrefs['community']>) => {
    const next = {
      ...modulePrefs,
      community: { ...prefs, ...patch },
    }
    setModulePrefs(next)
    await saveModulePrefs(next)
    setMessage('社区设置已保存')
  }

  return (
    <SettingsScroll>
      <Section title="Hub">
        <Field
          label="Hub Base URL"
          value={hubBaseUrl}
          onChangeText={setHubBaseUrl}
          placeholder="https://…"
        />
        <PrimaryButton
          label="保存 Hub 地址"
          onPress={() => void save({ hubBaseUrl: hubBaseUrl.trim() })}
        />
        <Toggle
          label="未登录时仅访客只读"
          value={prefs.guestReadOnly}
          onChange={(v) => void save({ guestReadOnly: v })}
        />
      </Section>
      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}

function SystemSettingsPanel() {
  const { syncStatus, desktopHostsOnline } = useMobileApp()
  const [analyticsOptIn, setAnalyticsOptIn] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <SettingsScroll>
      <Section title="关于">
        <Text style={styles.meta}>Toolman Mobile</Text>
        <Text style={styles.meta}>版本 0.1.0 · Expo / React Native</Text>
        <Text style={styles.meta}>与桌面端共用账户（identity_id）</Text>
      </Section>

      <Section title="运行状态">
        <Text style={styles.meta}>同步状态：{syncStatusLabel(syncStatus)}</Text>
        <Text style={styles.meta}>
          桌面宿主：{desktopHostsOnline > 0 ? `${desktopHostsOnline} 在线` : '无'}
        </Text>
      </Section>

      <Section title="通用">
        <Toggle
          label="匿名诊断信息（可选）"
          value={analyticsOptIn}
          onChange={(v) => {
            setAnalyticsOptIn(v)
            setMessage(v ? '已开启诊断上报偏好（占位）' : '已关闭诊断上报偏好')
          }}
        />
        <SecondaryButton
          label="打开隐私说明"
          onPress={() => setMessage('详见 docs/mobile/PRIVACY.md')}
        />
      </Section>

      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}

function syncStatusLabel(status: string): string {
  switch (status) {
    case 'syncing':
      return '同步中'
    case 'error':
      return '同步异常'
    case 'offline':
      return '离线'
    default:
      return '已同步'
  }
}

const styles = settingsUiStyles
