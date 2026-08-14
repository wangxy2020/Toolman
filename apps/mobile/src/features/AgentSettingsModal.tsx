import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { BUILTIN_SKILLS } from '@toolman/shared'
import { saveModulePrefs, type AgentPermissionMode, type ModulePrefs } from '../settings/prefs'
import {
  getProviderPreset,
  MOBILE_PROVIDER_PRESETS,
  normalizeChatBaseUrl,
  type MobileProviderId,
} from '../settings/provider-presets'
import { saveModelConfig } from '../storage/secure'
import { useMobileApp } from '../state/MobileAppContext'
import { colors } from '../theme'
import {
  CURATED_EDGE_TTS_VOICES,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '../voice'
import { useSettingsModalSize } from './settingsModalLayout'

type SettingsTab =
  | 'basic'
  | 'prompt'
  | 'permission'
  | 'tools'
  | 'skills'
  | 'knowledge'
  | 'advanced'

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'basic', label: '基础设置' },
  { id: 'prompt', label: '提示词设置' },
  { id: 'permission', label: '权限模式' },
  { id: 'tools', label: '工具集成' },
  { id: 'skills', label: '技能' },
  { id: 'knowledge', label: '知识库' },
  { id: 'advanced', label: '高级设置' },
]

const PERMISSION_MODES: Array<{
  id: AgentPermissionMode
  title: string
  description: string
  warning?: string
}> = [
  { id: 'normal', title: '普通模式', description: '可自由读取文件，编辑或执行命令前会询问。' },
  { id: 'plan', title: '计划模式', description: '只能读取文件和制定计划，不能编辑文件或执行命令。' },
  { id: 'auto-edit', title: '自动编辑模式', description: '可自由读取和编辑文件，执行命令前会询问。' },
  {
    id: 'full-auto',
    title: '全自动模式',
    description: '可执行任何操作，无需询问。请谨慎使用。',
    warning: '危险：所有工具都会在无审批情况下执行。',
  },
]

const MCP_CATALOG: Array<{ id: string; name: string; description: string }> = [
  { id: 'filesystem', name: 'Filesystem', description: '读写、搜索、编辑与删除本地文件' },
  { id: 'browser', name: 'Browser', description: 'CDP 浏览器自动化与网页抓取' },
  { id: 'github', name: 'GitHub', description: '访问 GitHub 仓库与 Issue' },
  { id: 'sqlite', name: 'SQLite', description: '查询本地 SQLite 数据库' },
  { id: 'fetch', name: 'Fetch', description: '官方 fetch MCP' },
  { id: 'memory', name: 'Memory', description: '官方知识图谱记忆 MCP' },
  { id: 'python', name: 'Python', description: '官方 Python 执行 MCP' },
  { id: 'brave-search', name: 'Brave Search', description: 'Brave Search 官方 MCP（需 API Key）' },
  { id: 'docx-mcp-server', name: 'Toolman DOCX MCP', description: 'Word 文档读写、批注、修订与排版' },
  { id: 'excel-mcp-server', name: 'Toolman Excel MCP', description: 'Excel 无损审核与单元格修改' },
  { id: 'dify', name: 'Dify Knowledge', description: '检索 Dify 知识库' },
  { id: 'hub', name: 'Hub', description: '聚合所有 MCP 工具' },
  { id: 'local-db', name: 'Local-db', description: '访问本地 PostgreSQL 数据库' },
]

const LANGS = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
] as const

type Draft = {
  name: string
  description: string
  providerId: MobileProviderId
  model: string
  autoSpeak: boolean
  ttsEngine: VoiceTtsEngine
  ttsVoice: string
  defaultWebSearch: boolean
  defaultKb: boolean
  preferDesktopHost: boolean
  heartbeatEnabled: boolean
  heartbeatIntervalMinutes: number
  translationLanguages: [string, string]
  systemPrompt: string
  permissionMode: AgentPermissionMode
  bashEnabled: boolean
  mcpServerIds: string[]
  skillIds: string[]
  kbIds: string[]
  temperature: number
  maxTokens: string
  sessionRoundLimit: number
  environmentVariables: string
}

type Props = {
  visible: boolean
  onClose: () => void
}

function draftFromState(
  prefs: ModulePrefs['agent'],
  providerId: string,
  model: string,
): Draft {
  return {
    name: prefs.name,
    description: prefs.description,
    providerId: (providerId as MobileProviderId) || 'deepseek',
    model,
    autoSpeak: prefs.autoSpeak,
    ttsEngine: prefs.ttsEngine,
    ttsVoice: prefs.ttsVoice,
    defaultWebSearch: prefs.defaultWebSearch,
    defaultKb: prefs.defaultKb,
    preferDesktopHost: prefs.preferDesktopHost,
    heartbeatEnabled: prefs.heartbeatEnabled,
    heartbeatIntervalMinutes: prefs.heartbeatIntervalMinutes,
    translationLanguages: [prefs.translationLanguages[0] ?? 'zh', prefs.translationLanguages[1] ?? 'en'],
    systemPrompt: prefs.systemPrompt,
    permissionMode: prefs.permissionMode,
    bashEnabled: prefs.bashEnabled,
    mcpServerIds: [...prefs.mcpServerIds],
    skillIds: [...prefs.skillIds],
    kbIds: [...prefs.kbIds],
    temperature: prefs.temperature,
    maxTokens: prefs.maxTokens,
    sessionRoundLimit: prefs.sessionRoundLimit,
    environmentVariables: prefs.environmentVariables,
  }
}

export function AgentSettingsModal({ visible, onClose }: Props) {
  const { width: dialogWidth, height: dialogHeight } = useSettingsModalSize()
  const { modelConfig, setModelConfig, modulePrefs, setModulePrefs } = useMobileApp()
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!visible) return
    setActiveTab('basic')
    setDraft(draftFromState(modulePrefs.agent, modelConfig.providerId, modelConfig.model))
  }, [visible])

  const titleName = draft?.name.trim() || '智能体'

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handleSave = async () => {
    if (!draft) return
    const name = draft.name.trim() || '智能体'
    const preset = getProviderPreset(draft.providerId)
    const nextModel = {
      ...modelConfig,
      providerId: draft.providerId,
      model: draft.model.trim() || preset.defaultModel,
      baseUrl: normalizeChatBaseUrl(modelConfig.baseUrl, draft.providerId),
    }
    const nextPrefs: ModulePrefs = {
      ...modulePrefs,
      agent: {
        ...modulePrefs.agent,
        name,
        description: draft.description.trim(),
        autoSpeak: draft.autoSpeak,
        ttsEngine: draft.ttsEngine,
        ttsVoice: resolveCuratedEdgeTtsVoice(draft.ttsVoice),
        defaultWebSearch: draft.defaultWebSearch,
        defaultKb: draft.defaultKb,
        preferDesktopHost: draft.preferDesktopHost,
        heartbeatEnabled: draft.heartbeatEnabled,
        heartbeatIntervalMinutes: Math.max(1, Number(draft.heartbeatIntervalMinutes) || 30),
        translationLanguages: draft.translationLanguages,
        systemPrompt: draft.systemPrompt,
        permissionMode: draft.permissionMode,
        bashEnabled: draft.bashEnabled,
        mcpServerIds: draft.mcpServerIds,
        skillIds: draft.skillIds,
        kbIds: draft.kbIds,
        temperature: draft.temperature,
        maxTokens: draft.maxTokens.trim(),
        sessionRoundLimit: Math.max(1, Number(draft.sessionRoundLimit) || 100),
        environmentVariables: draft.environmentVariables,
      },
    }
    await saveModelConfig(nextModel)
    setModelConfig(nextModel)
    setModulePrefs(nextPrefs)
    await saveModulePrefs(nextPrefs)
    onClose()
  }

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
                {TABS.map((tab) => {
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
  tab: SettingsTab
  draft: Draft
  updateDraft: (patch: Partial<Draft>) => void
}) {
  const { tab, draft, updateDraft } = props
  const { knowledgeMeta } = useMobileApp()
  const preset = getProviderPreset(draft.providerId)
  const modelOptions = useMemo(() => {
    const ids = new Set([draft.model, ...preset.suggestedModels].filter(Boolean))
    return Array.from(ids)
  }, [draft.model, preset.suggestedModels])

  if (tab === 'prompt') {
    return (
      <View style={styles.form}>
        <Text style={styles.label}>系统提示词</Text>
        <TextInput
          style={[styles.input, styles.textarea, styles.textareaTall]}
          multiline
          value={draft.systemPrompt}
          onChangeText={(systemPrompt) => updateDraft({ systemPrompt })}
          textAlignVertical="top"
        />
      </View>
    )
  }

  if (tab === 'permission') {
    const effective = PERMISSION_MODES.find((item) => item.id === draft.permissionMode)?.title
    return (
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>权限模式</Text>
        <Text style={styles.hint}>当前生效：{effective}</Text>
        <View style={styles.permGrid}>
          {PERMISSION_MODES.map((mode) => {
            const selected = draft.permissionMode === mode.id
            return (
              <Pressable
                key={mode.id}
                onPress={() => updateDraft({ permissionMode: mode.id })}
                style={[styles.permCard, selected ? styles.permCardActive : null]}
              >
                {selected ? <Text style={styles.permCheck}>✓</Text> : null}
                <Text style={styles.permTitle}>{mode.title}</Text>
                <Text style={styles.permDesc}>{mode.description}</Text>
                {mode.warning ? <Text style={styles.permWarn}>⚠ {mode.warning}</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </View>
    )
  }

  if (tab === 'tools') {
    return (
      <View style={styles.form}>
        <Text style={styles.sectionTitle}>预授权工具</Text>
        <ToggleRow
          label="Bash"
          hint="在环境中执行 Shell 命令。禁用时需要人工审批。"
          value={draft.bashEnabled}
          onChange={(bashEnabled) => updateDraft({ bashEnabled })}
        />
        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>MCP 服务器</Text>
        <Text style={styles.hint}>移动端可保存挂载选择；实际连接由桌面端运行。</Text>
        {MCP_CATALOG.map((server) => (
          <ToggleRow
            key={server.id}
            label={server.name}
            hint={server.description}
            value={draft.mcpServerIds.includes(server.id)}
            onChange={(enabled) =>
              updateDraft({
                mcpServerIds: enabled
                  ? [...new Set([...draft.mcpServerIds, server.id])]
                  : draft.mcpServerIds.filter((id) => id !== server.id),
              })
            }
          />
        ))}
      </View>
    )
  }

  if (tab === 'skills') {
    return (
      <View style={styles.form}>
        <Text style={styles.hint}>已安装的技能可按需挂载；运行时会把技能说明注入系统提示。</Text>
        {BUILTIN_SKILLS.map((skill) => (
          <ToggleRow
            key={skill.id}
            label={skill.name}
            hint={skill.description}
            value={draft.skillIds.includes(skill.id)}
            onChange={(enabled) =>
              updateDraft({
                skillIds: enabled
                  ? [...new Set([...draft.skillIds, skill.id])]
                  : draft.skillIds.filter((id) => id !== skill.id),
              })
            }
          />
        ))}
      </View>
    )
  }

  if (tab === 'knowledge') {
    return (
      <View style={styles.form}>
        <Text style={styles.hint}>选择对话时可检索的知识库。</Text>
        {knowledgeMeta.length === 0 ? (
          <Text style={styles.hint}>暂无已同步的知识库。可在知识库页从桌面同步。</Text>
        ) : (
          knowledgeMeta.map((item) => (
            <ToggleRow
              key={item.id}
              label={item.name}
              hint={`${item.documentCount} 篇文档`}
              value={draft.kbIds.includes(item.id)}
              onChange={(enabled) =>
                updateDraft({
                  kbIds: enabled
                    ? [...new Set([...draft.kbIds, item.id])]
                    : draft.kbIds.filter((id) => id !== item.id),
                  defaultKb: enabled ? true : draft.defaultKb,
                })
              }
            />
          ))
        )}
      </View>
    )
  }

  if (tab === 'advanced') {
    return (
      <View style={styles.form}>
        <Text style={styles.label}>温度 (Temperature)</Text>
        <Text style={styles.hint}>越高越有创造性，越低越稳定；范围 0–2</Text>
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            keyboardType="decimal-pad"
            value={String(draft.temperature)}
            onChangeText={(value) => {
              const next = Number(value)
              updateDraft({ temperature: Number.isFinite(next) ? Math.min(2, Math.max(0, next)) : 0 })
            }}
          />
          <Text style={styles.unit}>{draft.temperature.toFixed(1)}</Text>
        </View>
        <Text style={styles.label}>最大输出 Token</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          placeholder="默认"
          placeholderTextColor={colors.textSecondary}
          value={draft.maxTokens}
          onChangeText={(maxTokens) => updateDraft({ maxTokens })}
        />
        <Text style={styles.label}>会话轮次上限</Text>
        <Text style={styles.hint}>数值越高可自主运行越久；数值越低更易控制。</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={String(draft.sessionRoundLimit)}
          onChangeText={(value) => updateDraft({ sessionRoundLimit: Number(value) || 100 })}
        />
        <Text style={styles.label}>环境变量</Text>
        <Text style={styles.hint}>每行一个，格式：KEY=value</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={draft.environmentVariables}
          onChangeText={(environmentVariables) => updateDraft({ environmentVariables })}
          placeholder={'KEY=value\nANOTHER_KEY=value'}
          placeholderTextColor={colors.textSecondary}
          textAlignVertical="top"
        />
      </View>
    )
  }

  return (
    <View style={styles.form}>
      <FieldRow label="名称">
        <TextInput
          style={styles.input}
          value={draft.name}
          onChangeText={(name) => updateDraft({ name })}
        />
      </FieldRow>
      <FieldRow label="模型" hint="选择运行此智能体的本地或云端大模型">
        <View style={styles.chipRow}>
          {MOBILE_PROVIDER_PRESETS.map((item) => {
            const active = draft.providerId === item.id
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  const next = getProviderPreset(item.id)
                  updateDraft({
                    providerId: item.id,
                    model: next.defaultModel || draft.model,
                  })
                }}
                style={[styles.chip, active ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{item.name}</Text>
              </Pressable>
            )
          })}
        </View>
        <View style={styles.chipRow}>
          {modelOptions.map((id) => {
            const active = draft.model === id
            return (
              <Pressable
                key={id}
                onPress={() => updateDraft({ model: id })}
                style={[styles.chip, active ? styles.chipActive : null]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
                  {id}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <TextInput
          style={styles.input}
          value={draft.model}
          onChangeText={(model) => updateDraft({ model })}
          placeholder={preset.defaultModel || '模型 ID'}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </FieldRow>
      <FieldRow label="工作目录">
        <TextInput
          style={[styles.input, styles.inputReadonly]}
          editable={false}
          value=""
          placeholder="未设置工作目录（请在桌面端配置）"
          placeholderTextColor={colors.textSecondary}
        />
      </FieldRow>
      <ToggleRow
        label="启用心跳"
        hint="定期触发智能体后台检查任务"
        value={draft.heartbeatEnabled}
        onChange={(heartbeatEnabled) => updateDraft({ heartbeatEnabled })}
      />
      <ToggleRow
        label="自动朗读回复"
        hint="开启后，智能体生成最终回答时将自动朗读（仍可在消息底部手动播放）"
        value={draft.autoSpeak}
        onChange={(autoSpeak) => updateDraft({ autoSpeak })}
      />
      <FieldRow label="语音引擎" hint="Edge 神经语音更自然（需联网，无需 API 密钥）">
        <ChoiceList
          value={draft.ttsEngine}
          options={[
            { id: 'edge', label: 'Edge 神经语音（推荐，免密钥）' },
            { id: 'web-speech', label: '系统语音（Web Speech）' },
          ]}
          onChange={(id) => updateDraft({ ttsEngine: id as VoiceTtsEngine })}
        />
      </FieldRow>
      {draft.ttsEngine === 'edge' ? (
        <FieldRow label="朗读音色">
          <ChoiceList
            value={draft.ttsVoice}
            options={CURATED_EDGE_TTS_VOICES.map((voice) => ({
              id: voice.value,
              label: voice.label,
            }))}
            onChange={(id) => updateDraft({ ttsVoice: resolveCuratedEdgeTtsVoice(id) })}
          />
        </FieldRow>
      ) : null}
      <FieldRow label="间隔 (分钟)">
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, styles.inlineInput]}
            keyboardType="number-pad"
            value={String(draft.heartbeatIntervalMinutes)}
            onChangeText={(value) =>
              updateDraft({ heartbeatIntervalMinutes: Number(value) || 30 })
            }
          />
          <Text style={styles.unit}>min</Text>
        </View>
      </FieldRow>
      <FieldRow label="翻译目标语言" hint="点击翻译时，自动识别原文语言并翻译成另一种目标语言">
        <View style={styles.inlineRow}>
          <View style={styles.flex}>
            <ChoiceList
              value={draft.translationLanguages[0]}
              options={LANGS.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(id) => updateDraft({ translationLanguages: [id, draft.translationLanguages[1]] })}
            />
          </View>
          <Text style={styles.unit}>↔</Text>
          <View style={styles.flex}>
            <ChoiceList
              value={draft.translationLanguages[1]}
              options={LANGS.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(id) => updateDraft({ translationLanguages: [draft.translationLanguages[0], id] })}
            />
          </View>
        </View>
      </FieldRow>
      <ToggleRow
        label="默认启用联网搜索"
        value={draft.defaultWebSearch}
        onChange={(defaultWebSearch) => updateDraft({ defaultWebSearch })}
      />
      <ToggleRow
        label="默认启用知识库"
        value={draft.defaultKb}
        onChange={(defaultKb) => updateDraft({ defaultKb })}
      />
      <ToggleRow
        label="优先经桌面宿主调用"
        value={draft.preferDesktopHost}
        onChange={(preferDesktopHost) => updateDraft({ preferDesktopHost })}
      />
      <FieldRow label="描述">
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={draft.description}
          onChangeText={(description) => updateDraft({ description })}
          placeholder="可选"
          placeholderTextColor={colors.textSecondary}
          textAlignVertical="top"
        />
      </FieldRow>
    </View>
  )
}

function FieldRow(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{props.label}</Text>
        {props.hint ? <Text style={styles.hintInline}>{props.hint}</Text> : null}
      </View>
      {props.children}
    </View>
  )
}

function ToggleRow(props: {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Pressable onPress={() => props.onChange(!props.value)} style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{props.label}</Text>
        {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      </View>
      <View style={[styles.switchTrack, props.value ? styles.switchTrackOn : null]}>
        <View style={[styles.switchThumb, props.value ? styles.switchThumbOn : null]} />
      </View>
    </Pressable>
  )
}

function ChoiceList(props: {
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (id: string) => void
}) {
  return (
    <View style={styles.choiceList}>
      {props.options.map((option) => {
        const active = option.id === props.value
        return (
          <Pressable
            key={option.id}
            onPress={() => props.onChange(option.id)}
            style={[styles.choiceRow, active ? styles.choiceRowActive : null]}
          >
            <Text style={[styles.choiceText, active ? styles.choiceTextActive : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
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
  navItemActive: {
    backgroundColor: colors.accentSoft,
    borderLeftColor: colors.accent,
  },
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
  form: { gap: 14 },
  fieldBlock: { gap: 8 },
  labelRow: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500', color: colors.text },
  hint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  hintInline: { fontSize: 11, lineHeight: 16, color: colors.textSecondary },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  sectionSpaced: { marginTop: 8 },
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
  inputReadonly: { backgroundColor: colors.hover, color: colors.textSecondary },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  textareaTall: { minHeight: 220 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 12, color: colors.textSecondary },
  chipTextActive: { color: colors.accent, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  toggleLabel: { fontSize: 13, fontWeight: '500', color: colors.text },
  switchTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d7dbe0',
    padding: 2,
    justifyContent: 'center',
    flexShrink: 0,
  },
  switchTrackOn: { backgroundColor: colors.accent },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  switchThumbOn: { alignSelf: 'flex-end' },
  choiceList: { gap: 6 },
  choiceRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceText: { fontSize: 13, color: colors.text },
  choiceTextActive: { color: colors.accent, fontWeight: '500' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineInput: { flex: 1, minWidth: 0 },
  unit: { fontSize: 13, color: colors.textSecondary },
  flex: { flex: 1, minWidth: 0 },
  permGrid: { flexDirection: 'column', gap: 12 },
  permCard: {
    width: '100%',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
    backgroundColor: colors.bg,
  },
  permCardActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  permCheck: { position: 'absolute', right: 8, top: 8, color: colors.accent, fontWeight: '700' },
  permTitle: { fontSize: 13, fontWeight: '600', color: colors.text, paddingRight: 16 },
  permDesc: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  permWarn: { fontSize: 11, color: colors.danger },
})
