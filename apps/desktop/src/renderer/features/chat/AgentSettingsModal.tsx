import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Assistant, type Provider, type Workspace } from '@toolman/shared'
import { IconPlus } from '../../components/icons'
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
import { buildModelOptions, modelNameFromId, providerNameFromModelId } from './model-utils'
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
  { id: 'tools', label: '工具' },
  { id: 'skills', label: '技能' },
  { id: 'knowledge', label: '知识库' },
  { id: 'advanced', label: '高级设置' },
]

interface Props {
  assistant: Assistant
  workspace: Workspace | null
  providers: Provider[]
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
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

function HelpHint({ title }: { title: string }) {
  return (
    <button type="button" className="tm-agent-help" title={title}>
      i
    </button>
  )
}

export function AgentSettingsModal({ assistant, workspace, providers, onClose, onSaved }: Props) {
  const systemPaths = useSystemPaths()
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [name, setName] = useState(assistant.name)
  const [description, setDescription] = useState(assistant.description ?? '')
  const [systemPrompt, setSystemPrompt] = useState(assistant.systemPrompt)
  const [modelId, setModelId] = useState(assistant.modelId)
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
    setModelId(assistant.modelId)
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
  }, [assistant, workspace])

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

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-agent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-agent-modal-header">
          <h2 className="tm-agent-modal-title">{name}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-agent-modal-body">
          <nav className="tm-agent-modal-nav">
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
                  <label className="tm-agent-setting-label">名称</label>
                  <input
                    className="tm-agent-setting-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                      if (name.trim() && name !== assistant.name) void save({ name: name.trim() })
                    }}
                  />
                </div>

                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label">
                    模型
                    <HelpHint title="选择该智能体默认使用的大模型" />
                  </label>
                  <div className="tm-agent-model-select-wrap">
                    <select
                      className="tm-agent-model-select"
                      value={modelId}
                      onChange={(e) => {
                        setModelId(e.target.value)
                        void save({ modelId: e.target.value })
                      }}
                    >
                      {modelOptions.map((opt) => (
                        <option key={opt.modelId} value={opt.modelId}>
                          {`${modelNameFromId(opt.modelId)} | ${providerNameFromModelId(opt.modelId, providers)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="tm-agent-setting-block">
                  <div className="tm-agent-setting-row tm-agent-setting-row--top">
                    <label className="tm-agent-setting-label">
                      工作目录
                      <button
                        type="button"
                        className="tm-agent-inline-btn"
                        title="选择工作目录"
                        onClick={() => void handleSelectWorkingDirectory()}
                      >
                        <IconPlus size={14} />
                      </button>
                    </label>
                  </div>
                  {effectiveWorkingDirectory ? (
                    <div className="tm-agent-workdir-row">
                      <span className="tm-agent-workdir-path" title={effectiveWorkingDirectory}>
                        {effectiveWorkingDirectory}
                      </span>
                      {workingDirectory ? (
                        <button
                          type="button"
                          className="tm-agent-workdir-delete"
                          onClick={handleRemoveWorkingDirectory}
                        >
                          删除
                        </button>
                      ) : (
                        <span className="tm-agent-workdir-tag">工作区默认</span>
                      )}
                    </div>
                  ) : (
                    <div className="tm-agent-workdir-empty">未设置工作目录</div>
                  )}
                </div>

                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label">
                    自主模式
                    <HelpHint title="开启后智能体可自主执行更多操作" />
                  </label>
                  <Toggle
                    checked={autonomousMode}
                    onChange={(value) => {
                      setAutonomousMode(value)
                      void save({ parameters: { ...getParameters(), autonomousMode: value } })
                    }}
                  />
                </div>

                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label">
                    启用心跳
                    <HelpHint title="定期触发智能体后台检查任务" />
                  </label>
                  <Toggle
                    checked={heartbeatEnabled}
                    onChange={(value) => {
                      setHeartbeatEnabled(value)
                      void save({ parameters: { ...getParameters(), heartbeatEnabled: value } })
                    }}
                  />
                </div>

                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label">
                    间隔 (分钟)
                    <HelpHint title="心跳触发的时间间隔" />
                  </label>
                  <div className="tm-agent-interval-wrap">
                    <input
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
                  <label className="tm-agent-setting-label">
                    翻译目标语言
                    <HelpHint title="点击翻译时，自动识别原文语言并翻译成另一种目标语言" />
                  </label>
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
                  <label className="tm-agent-setting-label">描述</label>
                  <textarea
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
                  const next = enabled
                    ? [...new Set([...skillIds, skillId])]
                    : skillIds.filter((id) => id !== skillId)
                  setSkillIds(next)
                  void save({ parameters: { ...getParameters(), skillIds: next } })
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

            {busy && <div className="tm-agent-saving">保存中…</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
