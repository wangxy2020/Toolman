import { useEffect, useMemo, useState } from 'react'
import { resolveAgentChatScope } from '../chat/agentScopes'
import { saveModulePrefs, type AgentPermissionMode, type ModulePrefs } from '../settings/prefs'
import {
  getProviderPreset,
  normalizeChatBaseUrl,
  type MobileProviderId,
} from '../settings/provider-presets'
import { saveModelConfig } from '../storage/secure'
import {
  readProviderCredential,
  upsertProviderCredentials,
} from '../storage/providerCredentials'
import { useMobileApp, type ModelConfig, type MobileAgent } from '../state/MobileAppContext'
import {
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '../voice'
import {
  defaultAgentSettingsFromPrefs,
  resolveActiveAgent,
  resolveAgentSettings,
  type MobileAgentSettings,
} from './agentSettingsResolve'
import { createMobileAgent } from './agentPaneUtils'

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
  name: string,
  settings: MobileAgentSettings,
  providerId: string,
  model: string,
): AgentSettingsDraft {
  return {
    name,
    description: settings.description,
    providerId: (providerId as MobileProviderId) || 'deepseek',
    model,
    autoSpeak: settings.autoSpeak,
    ttsEngine: settings.ttsEngine,
    ttsVoice: settings.ttsVoice,
    defaultWebSearch: settings.defaultWebSearch,
    defaultKb: settings.defaultKb,
    preferDesktopHost: settings.preferDesktopHost,
    heartbeatEnabled: settings.heartbeatEnabled,
    heartbeatIntervalMinutes: settings.heartbeatIntervalMinutes,
    translationLanguages: [
      settings.translationLanguages[0] ?? 'zh',
      settings.translationLanguages[1] ?? 'en',
    ],
    systemPrompt: settings.systemPrompt,
    permissionMode: settings.permissionMode,
    bashEnabled: settings.bashEnabled,
    mcpServerIds: [...settings.mcpServerIds],
    skillIds: [...settings.skillIds],
    kbIds: [...settings.kbIds],
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    sessionRoundLimit: settings.sessionRoundLimit,
    environmentVariables: settings.environmentVariables,
  }
}

export function buildAgentSettingsFromDraft(draft: AgentSettingsDraft): MobileAgentSettings {
  return {
    preferDesktopHost: draft.preferDesktopHost,
    defaultWebSearch: draft.defaultWebSearch,
    defaultKb: draft.defaultKb,
    ttsEngine: draft.ttsEngine,
    ttsVoice: resolveCuratedEdgeTtsVoice(draft.ttsVoice),
    autoSpeak: draft.autoSpeak,
    description: draft.description.trim(),
    systemPrompt: draft.systemPrompt,
    permissionMode: draft.permissionMode,
    heartbeatEnabled: draft.heartbeatEnabled,
    heartbeatIntervalMinutes: Math.max(1, Number(draft.heartbeatIntervalMinutes) || 30),
    temperature: draft.temperature,
    maxTokens: draft.maxTokens.trim(),
    sessionRoundLimit: Math.max(1, Number(draft.sessionRoundLimit) || 100),
    environmentVariables: draft.environmentVariables,
    mcpServerIds: draft.mcpServerIds,
    skillIds: draft.skillIds,
    kbIds: draft.kbIds,
    bashEnabled: draft.bashEnabled,
    translationLanguages: draft.translationLanguages,
    providerId: draft.providerId,
    model: draft.model.trim(),
  }
}

export function buildAgentModelFromDraft(
  modelConfig: ModelConfig,
  draft: AgentSettingsDraft,
): ModelConfig {
  const preset = getProviderPreset(draft.providerId)
  const credentialsByProvider = upsertProviderCredentials(
    modelConfig.credentialsByProvider,
    modelConfig.providerId,
    {
      apiKey: modelConfig.apiKey,
      baseUrl: modelConfig.baseUrl,
      model: modelConfig.model,
    },
  )
  const switched = draft.providerId !== modelConfig.providerId
  const stored = readProviderCredential(credentialsByProvider, draft.providerId)
  const apiKey = switched ? (stored?.apiKey ?? '') : modelConfig.apiKey
  const baseUrl = switched
    ? stored?.baseUrl || preset.defaultBaseUrl
    : modelConfig.baseUrl
  const model = draft.model.trim() || stored?.model || preset.defaultModel
  const nextUrl = normalizeChatBaseUrl(baseUrl, draft.providerId)
  return {
    ...modelConfig,
    providerId: draft.providerId,
    model,
    baseUrl: nextUrl,
    apiKey,
    credentialsByProvider: upsertProviderCredentials(credentialsByProvider, draft.providerId, {
      apiKey,
      baseUrl: nextUrl,
      model,
    }),
  }
}

/** Keep modulePrefs.agent as defaults for new agents (sidebar name lives on MobileAgent). */
export function buildAgentPrefsFromDraft(
  modulePrefs: ModulePrefs,
  draft: AgentSettingsDraft,
): ModulePrefs {
  const settings = buildAgentSettingsFromDraft(draft)
  const { providerId: _providerId, model: _model, ...agentPrefs } = settings
  return {
    ...modulePrefs,
    agent: {
      ...modulePrefs.agent,
      ...agentPrefs,
      name: draft.name.trim() || modulePrefs.agent.name || '智能体',
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
  const {
    modelConfig,
    setModelConfig,
    modulePrefs,
    setModulePrefs,
    module,
    agents,
    sessions,
    activeSessionId,
    upsertAgent,
  } = useMobileApp()
  const agentScope = resolveAgentChatScope(module)
  const [activeTab, setActiveTab] = useState<AgentSettingsTab>('basic')
  const [draft, setDraft] = useState<AgentSettingsDraft | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setActiveTab('basic')
    const activeAgent = resolveActiveAgent({
      agents,
      sessions,
      activeSessionId,
      agentScope,
    })
    const settings = resolveAgentSettings(activeAgent, modulePrefs.agent)
    const providerId = settings.providerId || modelConfig.providerId
    const model = settings.model || modelConfig.model
    setEditingAgentId(activeAgent?.id ?? null)
    setDraft(
      draftFromAgentState(
        activeAgent?.name ?? modulePrefs.agent.name,
        settings,
        providerId,
        model,
      ),
    )
  }, [visible, activeSessionId, agentScope])

  const titleName = draft?.name.trim() || '智能体'

  const updateDraft = (patch: Partial<AgentSettingsDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const handleSave = async () => {
    if (!draft) return
    const nextModel = buildAgentModelFromDraft(modelConfig, draft)
    const nextPrefs = buildAgentPrefsFromDraft(modulePrefs, draft)
    const settings = buildAgentSettingsFromDraft(draft)
    const nextName = draft.name.trim() || '智能体'

    let target: MobileAgent | null =
      (editingAgentId
        ? agents.find((agent) => agent.id === editingAgentId) ?? null
        : null) ??
      resolveActiveAgent({ agents, sessions, activeSessionId, agentScope })

    if (!target && agentScope !== 'classroom') {
      target = createMobileAgent(
        agentScope,
        agents.filter((agent) => agent.agentScope === agentScope),
        defaultAgentSettingsFromPrefs(modulePrefs.agent),
      )
    }

    if (target) {
      upsertAgent({
        ...target,
        name: nextName,
        settings,
      })
    }

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
