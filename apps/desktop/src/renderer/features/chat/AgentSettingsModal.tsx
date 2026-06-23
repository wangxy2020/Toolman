import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Assistant, type Provider, type Session, type Workspace } from '@toolman/shared'
import {
  isGroupProxyAssistant,
  resolveGroupProxyAssistantModelId,
} from '../group/group-agent-utils'
import { AgentSettingsAdvancedTab } from './AgentSettingsAdvancedTab'
import { AgentSettingsKnowledgeTab } from './AgentSettingsKnowledgeTab'
import { AgentSettingsPermissionTab } from './AgentSettingsPermissionTab'
import { AgentSettingsSkillsTab } from './AgentSettingsSkillsTab'
import { AgentSettingsToolsTab } from './AgentSettingsToolsTab'
import {
  DEFAULT_PERMISSION_MODE,
  DEFAULT_SESSION_ROUND_LIMIT,
  getDefaultMcpServerIds,
  getDefaultSkillIds,
  getDefaultToolStates,
  type PermissionMode,
} from './agent-settings-constants'
import { buildModelOptions, formatModelDisplayLabel } from './model-utils'
import { getEffectiveWorkingDirectory, getWorkspaceFolderPath } from './workspace-utils'
import { useSystemPaths } from './useSystemPaths'
import {
  TRANSLATION_LANGUAGE_OPTIONS,
  normalizeTranslationLanguages,
} from './translation-utils'
import type { TranslationLanguage } from '@toolman/shared'

type SettingsTab = 'basic' | 'prompt' | 'permission' | 'tools' | 'skills' | 'knowledge' | 'advanced'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'basic', label: '基础设置' },
  { id: 'prompt', label: '提示词设置' },
  { id: 'permission', label: '权限模式' },
  { id: 'tools', label: '工具集成' },
  { id: 'skills', label: '技能' },
  { id: 'knowledge', label: '知识库' },
  { id: 'advanced', label: '高级设置' },
]

interface Props {
  assistant: Assistant
  workspace: Workspace | null
  providers: Provider[]
  activeSession?: Session | null
  onClose: () => void
  onSaved?: () => void
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-agent-toggle ${checked ? 'tm-agent-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-agent-toggle-thumb" />
    </button>
  )
}

function HelpHint({ title }: { title: string }) {
  return (
    <span className="tm-agent-help" title={title} aria-label={title}>
      ⓘ
    </span>
  )
}

export function AgentSettingsModal({
  assistant,
  workspace,
  providers,
  activeSession = null,
  onClose,
  onSaved,
}: Props) {
  const systemPaths = useSystemPaths()
  const groupProxyMode = isGroupProxyAssistant(assistant)
  const displayModelId = useMemo(
    () => resolveGroupProxyAssistantModelId(assistant, activeSession),
    [assistant, activeSession],
  )
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [name, setName] = useState(assistant.name)
  const [description, setDescription] = useState(assistant.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(assistant.systemPrompt)
  const [modelId, setModelId] = useState(displayModelId)
  const [workingDirectory, setWorkingDirectory] = useState(
    assistant.parameters.workingDirectory ?? '',
  )
  const effectiveWorkingDirectory = getEffectiveWorkingDirectory(
    workingDirectory || undefined,
    workspace,
    systemPaths,
  )
  const [autonomousMode, setAutonomousMode] = useState(assistant.parameters.autonomousMode ?? false)
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(
    assistant.parameters.heartbeatEnabled ?? false,
  )
  const [heartbeatInterval, setHeartbeatInterval] = useState(
    assistant.parameters.heartbeatIntervalMinutes ?? 30,
  )
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    assistant.parameters.permissionMode ?? DEFAULT_PERMISSION_MODE,
  )
  const [toolStates, setToolStates] = useState<Record<string, boolean>>(
    assistant.parameters.toolStates ?? getDefaultToolStates(),
  )
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(
    assistant.parameters.mcpServerIds ?? getDefaultMcpServerIds(),
  )
  const [skillIds, setSkillIds] = useState<string[]>(
    assistant.parameters.skillIds ?? getDefaultSkillIds(),
  )
  const [kbIds, setKbIds] = useState<string[]>(assistant.parameters.kbIds ?? [])
  const [kbTopK, setKbTopK] = useState<number | undefined>(assistant.parameters.kbTopK)
  const [kbScoreThreshold, setKbScoreThreshold] = useState<number | undefined>(
    assistant.parameters.kbScoreThreshold,
  )
  const [kbSettings, setKbSettings] = useState<
    Record<string, { topK?: number; scoreThreshold?: number }>
  >(assistant.parameters.kbSettings ?? {})
  const [sessionRoundLimit, setSessionRoundLimit] = useState(
    assistant.parameters.sessionRoundLimit ?? DEFAULT_SESSION_ROUND_LIMIT,
  )
  const [temperature, setTemperature] = useState(assistant.parameters.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(
    assistant.parameters.maxTokens ? String(assistant.parameters.maxTokens) : '',
  )
  const [environmentVariables, setEnvironmentVariables] = useState(
    assistant.parameters.environmentVariables ?? '',
  )
  const [translationLanguages, setTranslationLanguages] = useState<
    [TranslationLanguage, TranslationLanguage]
  >(normalizeTranslationLanguages(assistant.parameters.translationLanguages))
  const [busy, setBusy] = useState(false)

  const modelOptions = useMemo(() => buildModelOptions(providers), [providers])
  const sharedModelLabel = useMemo(
    () => formatModelDisplayLabel(displayModelId, providers),
    [displayModelId, providers],
  )

  const getParameters = useCallback(
    (): Assistant['parameters'] => ({
      temperature,
      topP: assistant.parameters.topP,
      maxTokens: maxTokens.trim() ? Number(maxTokens) || undefined : undefined,
      workingDirectory: workingDirectory || undefined,
      autonomousMode,
      heartbeatEnabled,
      heartbeatIntervalMinutes: heartbeatInterval,
      permissionMode,
      toolStates,
      mcpServerIds,
      skillIds,
      kbIds: kbIds.length > 0 ? kbIds : undefined,
      kbTopK,
      kbScoreThreshold,
      kbSettings: Object.keys(kbSettings).length > 0 ? kbSettings : undefined,
      sessionRoundLimit,
      environmentVariables: environmentVariables || undefined,
      translationLanguages,
    }),
    [
      assistant.parameters.temperature,
      assistant.parameters.topP,
      assistant.parameters.maxTokens,
      temperature,
      maxTokens,
      workingDirectory,
      autonomousMode,
      heartbeatEnabled,
      heartbeatInterval,
      permissionMode,
      toolStates,
      mcpServerIds,
      skillIds,
      kbIds,
      kbTopK,
      kbScoreThreshold,
      kbSettings,
      sessionRoundLimit,
      environmentVariables,
      translationLanguages,
    ],
  )

  useEffect(() => {
    setName(assistant.name)
    setDescription(assistant.description ?? '')
    setSystemPrompt(assistant.systemPrompt)
    setModelId(displayModelId)
    setWorkingDirectory(assistant.parameters.workingDirectory ?? '')
    setAutonomousMode(assistant.parameters.autonomousMode ?? false)
    setHeartbeatEnabled(assistant.parameters.heartbeatEnabled ?? false)
    setHeartbeatInterval(assistant.parameters.heartbeatIntervalMinutes ?? 30)
    setPermissionMode(assistant.parameters.permissionMode ?? DEFAULT_PERMISSION_MODE)
    setToolStates(assistant.parameters.toolStates ?? getDefaultToolStates())
    setMcpServerIds(assistant.parameters.mcpServerIds ?? getDefaultMcpServerIds())
    setSkillIds(assistant.parameters.skillIds ?? getDefaultSkillIds())
    setKbIds(assistant.parameters.kbIds ?? [])
    setKbTopK(assistant.parameters.kbTopK)
    setKbScoreThreshold(assistant.parameters.kbScoreThreshold)
    setKbSettings(assistant.parameters.kbSettings ?? {})
    setSessionRoundLimit(assistant.parameters.sessionRoundLimit ?? DEFAULT_SESSION_ROUND_LIMIT)
    setTemperature(assistant.parameters.temperature ?? 0.7)
    setMaxTokens(assistant.parameters.maxTokens ? String(assistant.parameters.maxTokens) : '')
    setEnvironmentVariables(assistant.parameters.environmentVariables ?? '')
    setTranslationLanguages(
      normalizeTranslationLanguages(assistant.parameters.translationLanguages),
    )
  }, [assistant, workspace, displayModelId])

  const save = useCallback(
    async (patch: {
      name?: string
      description?: string | null
      systemPrompt?: string
      modelId?: string
      parameters?: Assistant['parameters']
    }) => {
      setBusy(true)
      const result = await window.api.invoke(IpcChannel.AssistantUpdate, {
        id: assistant.id,
        ...patch,
      })
      setBusy(false)
      if (result.ok) onSaved?.()
    },
    [assistant.id, onSaved],
  )

  const handleSelectWorkingDirectory = async () => {
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFolder, {
      defaultPath: workingDirectory || getWorkspaceFolderPath(workspace, systemPaths) || undefined,
    })
    if (!pickResult.ok) return
    const { path } = pickResult.data as { path: string | null }
    if (!path) return
    setWorkingDirectory(path)
    void save({ parameters: { ...getParameters(), workingDirectory: path } })
  }

  const handleRemoveWorkingDirectory = () => {
    setWorkingDirectory('')
    void save({ parameters: { ...getParameters(), workingDirectory: undefined } })
  }

  const updateTranslationLanguage = (index: 0 | 1, value: TranslationLanguage) => {
    const next: [TranslationLanguage, TranslationLanguage] = [...translationLanguages]
    next[index] = value
    if (next[0] === next[1]) {
      next[1] = next[0] === 'zh' ? 'en' : 'zh'
    }
    setTranslationLanguages(next)
    void save({ parameters: { ...getParameters(), translationLanguages: next } })
  }

  const handleSaveAndClose = async () => {
    await save({
      name: name.trim() || assistant.name,
      description: description || null,
      systemPrompt,
      ...(groupProxyMode ? {} : { modelId }),
      parameters: getParameters(),
    })
    onClose()
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="agent-settings-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {name.trim() || assistant.name}设置
          </h3>
          <button type="button" className="tm-agent-modal-close" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-agent-modal-body">
          <nav className="tm-agent-modal-nav" aria-label="智能体设置分类">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tm-agent-modal-nav-item ${activeTab === tab.id ? 'tm-agent-modal-nav-item--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tm-agent-modal-content">
            {activeTab === 'basic' && (
              <div className="tm-agent-settings-form">
                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label" htmlFor="agent-settings-name">
                    名称
                  </label>
                  <input
                    id="agent-settings-name"
                    className="tm-agent-setting-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                      if (name.trim() && name !== assistant.name) void save({ name: name.trim() })
                    }}
                  />
                </div>

                <div className="tm-agent-setting-row">
                  <div className="tm-agent-setting-label-group">
                    <label className="tm-agent-setting-label" htmlFor="agent-settings-model">
                      模型
                    </label>
                    <HelpHint title="选择运行此智能体的本地或云端大模型" />
                  </div>
                  {groupProxyMode ? (
                    <input
                      id="agent-settings-model"
                      className="tm-agent-setting-input"
                      readOnly
                      value={sharedModelLabel}
                      title="群组共享智能体的模型由共享者决定"
                    />
                  ) : (
                    <select
                      id="agent-settings-model"
                      className="tm-agent-model-select"
                      value={modelId}
                      onChange={(e) => {
                        setModelId(e.target.value)
                        void save({ modelId: e.target.value })
                      }}
                    >
                      {modelOptions.map((opt) => (
                        <option key={opt.modelId} value={opt.modelId}>
                          {formatModelDisplayLabel(opt.modelId, providers)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="tm-agent-setting-row tm-agent-setting-row--top">
                  <label className="tm-agent-setting-label" htmlFor="agent-settings-workdir">
                    工作目录
                  </label>
                  <div className="tm-agent-workdir-field">
                    <div className="tm-agent-workdir-input-group">
                      <input
                        id="agent-settings-workdir"
                        className="tm-agent-workdir-input"
                        readOnly
                        value={effectiveWorkingDirectory}
                        placeholder="未设置工作目录"
                        title={effectiveWorkingDirectory}
                      />
                      <button
                        type="button"
                        className="tm-agent-workdir-browse"
                        onClick={() => void handleSelectWorkingDirectory()}
                      >
                        浏览
                      </button>
                    </div>
                    {workingDirectory ? (
                      <button
                        type="button"
                        className="tm-agent-workdir-reset"
                        onClick={handleRemoveWorkingDirectory}
                      >
                        恢复工作区默认
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="tm-agent-toggle-card">
                  <div className="tm-agent-toggle-card-item">
                    <span className="tm-agent-toggle-card-label">
                      自动编辑模式
                      <HelpHint title="开启后智能体可自主执行更多操作" />
                    </span>
                    <Toggle
                      checked={autonomousMode}
                      onChange={(value) => {
                        setAutonomousMode(value)
                        void save({ parameters: { ...getParameters(), autonomousMode: value } })
                      }}
                    />
                  </div>
                  <div className="tm-agent-toggle-card-item">
                    <span className="tm-agent-toggle-card-label">
                      启用心跳
                      <HelpHint title="定期触发智能体后台检查任务" />
                    </span>
                    <Toggle
                      checked={heartbeatEnabled}
                      onChange={(value) => {
                        setHeartbeatEnabled(value)
                        void save({ parameters: { ...getParameters(), heartbeatEnabled: value } })
                      }}
                    />
                  </div>
                </div>

                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label" htmlFor="agent-settings-heartbeat">
                    间隔 (分钟)
                  </label>
                  <div className="tm-agent-interval-wrap">
                    <input
                      id="agent-settings-heartbeat"
                      type="number"
                      className="tm-agent-interval-input"
                      min={1}
                      value={heartbeatInterval}
                      onChange={(e) => setHeartbeatInterval(Number(e.target.value) || 30)}
                      onBlur={() =>
                        void save({
                          parameters: {
                            ...getParameters(),
                            heartbeatIntervalMinutes: heartbeatInterval,
                          },
                        })
                      }
                    />
                    <span className="tm-agent-interval-unit">min</span>
                  </div>
                </div>

                <div className="tm-agent-setting-row">
                  <div className="tm-agent-setting-label-group">
                    <span className="tm-agent-setting-label">翻译目标语言</span>
                    <HelpHint title="点击翻译时，自动识别原文语言并翻译成另一种目标语言" />
                  </div>
                  <div className="tm-agent-translation-langs">
                    <select
                      className="tm-agent-model-select"
                      value={translationLanguages[0]}
                      onChange={(e) =>
                        updateTranslationLanguage(0, e.target.value as TranslationLanguage)
                      }
                    >
                      {TRANSLATION_LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <span className="tm-agent-translation-sep">↔</span>
                    <select
                      className="tm-agent-model-select"
                      value={translationLanguages[1]}
                      onChange={(e) =>
                        updateTranslationLanguage(1, e.target.value as TranslationLanguage)
                      }
                    >
                      {TRANSLATION_LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="tm-agent-setting-block">
                  <label className="tm-agent-setting-label" htmlFor="agent-settings-description">
                    描述
                  </label>
                  <textarea
                    id="agent-settings-description"
                    className="tm-agent-setting-textarea"
                    rows={4}
                    value={description}
                    placeholder="可选"
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => {
                      if (description !== (assistant.description ?? '')) {
                        void save({ description: description || null })
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'prompt' && (
              <div className="tm-agent-settings-form">
                <div className="tm-agent-setting-block">
                  <label className="tm-agent-setting-label">系统提示词</label>
                  <textarea
                    className="tm-agent-setting-textarea"
                    rows={10}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    onBlur={() => {
                      if (systemPrompt !== assistant.systemPrompt) {
                        void save({ systemPrompt })
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'permission' && (
              <AgentSettingsPermissionTab
                value={permissionMode}
                autonomousMode={autonomousMode}
                onChange={(mode) => {
                  setPermissionMode(mode)
                  void save({ parameters: { ...getParameters(), permissionMode: mode } })
                }}
              />
            )}

            {activeTab === 'tools' && (
              <AgentSettingsToolsTab
                toolStates={toolStates}
                mcpServerIds={mcpServerIds}
                workingDirectory={workingDirectory || undefined}
                environmentVariables={environmentVariables || undefined}
                onToolChange={(toolId, enabled) => {
                  const next = { ...toolStates, [toolId]: enabled }
                  setToolStates(next)
                  void save({ parameters: { ...getParameters(), toolStates: next } })
                }}
                onMcpToggle={(serverId, enabled) => {
                  const next = enabled
                    ? [...new Set([...mcpServerIds, serverId])]
                    : mcpServerIds.filter((id) => id !== serverId)
                  setMcpServerIds(next)
                  void save({ parameters: { ...getParameters(), mcpServerIds: next } })
                }}
              />
            )}

            {activeTab === 'skills' && (
              <AgentSettingsSkillsTab
                skillIds={skillIds}
                onSkillToggle={(skillId, enabled) => {
                  const nextSkills = enabled
                    ? [...new Set([...skillIds, skillId])]
                    : skillIds.filter((id) => id !== skillId)
                  setSkillIds(nextSkills)
                  void save({
                    parameters: {
                      ...getParameters(),
                      skillIds: nextSkills,
                    },
                  })
                }}
              />
            )}

            {activeTab === 'knowledge' && (
              <AgentSettingsKnowledgeTab
                workspaceId={assistant.workspaceId}
                kbIds={kbIds}
                kbTopK={kbTopK}
                kbScoreThreshold={kbScoreThreshold}
                kbSettings={kbSettings}
                onKbToggle={(kbId, enabled) => {
                  const next = enabled
                    ? [...new Set([...kbIds, kbId])]
                    : kbIds.filter((id) => id !== kbId)
                  setKbIds(next)
                  void save({
                    parameters: {
                      ...getParameters(),
                      kbIds: next,
                    },
                  })
                }}
                onKbTopKChange={(value) => {
                  setKbTopK(value)
                  void save({
                    parameters: {
                      ...getParameters(),
                      kbTopK: value,
                    },
                  })
                }}
                onKbScoreThresholdChange={(value) => {
                  setKbScoreThreshold(value)
                  void save({
                    parameters: {
                      ...getParameters(),
                      kbScoreThreshold: value,
                    },
                  })
                }}
                onKbSettingChange={(kbId, patch) => {
                  const merged = { ...(kbSettings[kbId] ?? {}), ...patch }
                  const cleanedEntry: { topK?: number; scoreThreshold?: number } = {}
                  if (merged.topK !== undefined) cleanedEntry.topK = merged.topK
                  if (merged.scoreThreshold !== undefined) {
                    cleanedEntry.scoreThreshold = merged.scoreThreshold
                  }

                  const next = { ...kbSettings }
                  if (Object.keys(cleanedEntry).length === 0) {
                    delete next[kbId]
                  } else {
                    next[kbId] = cleanedEntry
                  }

                  setKbSettings(next)
                  void save({
                    parameters: {
                      ...getParameters(),
                      kbSettings: Object.keys(next).length > 0 ? next : undefined,
                    },
                  })
                }}
              />
            )}

            {activeTab === 'advanced' && (
              <AgentSettingsAdvancedTab
                sessionRoundLimit={sessionRoundLimit}
                environmentVariables={environmentVariables}
                temperature={temperature}
                maxTokens={maxTokens}
                onSessionRoundLimitChange={setSessionRoundLimit}
                onSessionRoundLimitBlur={() =>
                  void save({
                    parameters: { ...getParameters(), sessionRoundLimit },
                  })
                }
                onEnvironmentVariablesChange={setEnvironmentVariables}
                onEnvironmentVariablesBlur={() =>
                  void save({
                    parameters: {
                      ...getParameters(),
                      environmentVariables: environmentVariables || undefined,
                    },
                  })
                }
                onTemperatureChange={setTemperature}
                onTemperatureBlur={() =>
                  void save({
                    parameters: { ...getParameters(), temperature },
                  })
                }
                onMaxTokensChange={setMaxTokens}
                onMaxTokensBlur={() =>
                  void save({
                    parameters: {
                      ...getParameters(),
                      maxTokens: maxTokens.trim() ? Number(maxTokens) || undefined : undefined,
                    },
                  })
                }
              />
            )}

            {busy ? <div className="tm-agent-saving">保存中…</div> : null}
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            disabled={busy}
            onClick={() => void handleSaveAndClose()}
          >
            保存设置
          </button>
        </footer>
      </div>
    </div>
  )
}
