import { useEffect, useMemo, useState } from 'react'
import { saveModulePrefs, type AgentPermissionMode, type ModulePrefs } from '../settings/prefs'
import {
  getProviderPreset,
  normalizeChatBaseUrl,
  type MobileProviderId,
} from '../settings/provider-presets'
import { saveModelConfig } from '../storage/secure'
import { useMobileApp, type ModelConfig } from '../state/MobileAppContext'
import {
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '../voice'

export type AgentSettingsTab =
  | 'basic'
  | 'prompt'
  | 'permission'
  | 'tools'
  | 'skills'
  | 'knowledge'
  | 'advanced'

export const AGENT_SETTINGS_TABS: Array<{ id: AgentSettingsTab; label: string }> = [
  { id: 'basic', label: '基础设置' },
  { id: 'prompt', label: '提示词设置' },
  { id: 'permission', label: '权限模式' },
  { id: 'tools', label: '工具集成' },
  { id: 'skills', label: '技能' },
  { id: 'knowledge', label: '知识库' },
  { id: 'advanced', label: '高级设置' },
]

export const AGENT_PERMISSION_MODES: Array<{
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

export const AGENT_MCP_CATALOG: Array<{ id: string; name: string; description: string }> = [
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

export const AGENT_TRANSLATION_LANGS = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
] as const

export type AgentSettingsDraft = {
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

export function draftFromAgentState(
  prefs: ModulePrefs['agent'],
  providerId: string,
  model: string,
): AgentSettingsDraft {
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

export function buildAgentModelFromDraft(
  modelConfig: ModelConfig,
  draft: AgentSettingsDraft,
): ModelConfig {
  const preset = getProviderPreset(draft.providerId)
  return {
    ...modelConfig,
    providerId: draft.providerId,
    model: draft.model.trim() || preset.defaultModel,
    baseUrl: normalizeChatBaseUrl(modelConfig.baseUrl, draft.providerId),
  }
}

export function buildAgentPrefsFromDraft(
  modulePrefs: ModulePrefs,
  draft: AgentSettingsDraft,
): ModulePrefs {
  const name = draft.name.trim() || '智能体'
  return {
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
}

export function toggleIdList(ids: string[], id: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...ids, id])] : ids.filter((item) => item !== id)
}

export function clampAgentTemperature(value: string): number {
  const next = Number(value)
  return Number.isFinite(next) ? Math.min(2, Math.max(0, next)) : 0
}

export function useAgentSettingsModal(visible: boolean, onClose: () => void) {
  const { modelConfig, setModelConfig, modulePrefs, setModulePrefs } = useMobileApp()
  const [activeTab, setActiveTab] = useState<AgentSettingsTab>('basic')
  const [draft, setDraft] = useState<AgentSettingsDraft | null>(null)

  useEffect(() => {
    if (!visible) return
    setActiveTab('basic')
    setDraft(draftFromAgentState(modulePrefs.agent, modelConfig.providerId, modelConfig.model))
  }, [visible])

  const titleName = draft?.name.trim() || '智能体'

  const updateDraft = (patch: Partial<AgentSettingsDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handleSave = async () => {
    if (!draft) return
    const nextModel = buildAgentModelFromDraft(modelConfig, draft)
    const nextPrefs = buildAgentPrefsFromDraft(modulePrefs, draft)
    await saveModelConfig(nextModel)
    setModelConfig(nextModel)
    setModulePrefs(nextPrefs)
    await saveModulePrefs(nextPrefs)
    onClose()
  }

  return {
    activeTab,
    setActiveTab,
    draft,
    titleName,
    updateDraft,
    handleSave,
  }
}

export function useAgentModelOptions(draft: AgentSettingsDraft) {
  const preset = getProviderPreset(draft.providerId)
  const modelOptions = useMemo(() => {
    const ids = new Set([draft.model, ...preset.suggestedModels].filter(Boolean))
    return Array.from(ids)
  }, [draft.model, preset.suggestedModels])
  return { preset, modelOptions }
}
