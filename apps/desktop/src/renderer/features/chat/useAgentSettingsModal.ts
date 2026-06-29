import { useCallback, useMemo, useState } from 'react'
import { IpcChannel, type Assistant, type TranslationLanguage } from '@toolman/shared'
import {
  isGroupProxyAssistant,
  resolveGroupProxyAssistantModelId,
  resolveGroupProxyAssistantDisplayName,
} from '../group/group-agent-utils'
import { buildModelOptions, formatModelDisplayLabel } from './model-utils'
import { getEffectiveWorkingDirectory, getWorkspaceFolderPath } from './workspace-utils'
import { useSystemPaths } from './useSystemPaths'
import { useI18n } from '../../i18n/useI18n'
import { getAgentSettingsTabs } from '../../i18n/agent-labels'
import {
  translateAssistantName,
  translateAssistantDescription,
  translateGroupFormattedAgentName,
  translateSystemPrompt,
} from '../../i18n/system-labels'
import type { AgentSettingsModalProps, SettingsTab } from './agent-settings-modal-types'
import { buildAgentSettingsParameters } from './agent-settings-modal-state'
import { useAgentSettingsFormState } from './useAgentSettingsFormState'

export function useAgentSettingsModal({
  assistant,
  workspace,
  providers,
  activeSession = null,
  onSaved,
}: AgentSettingsModalProps) {
  const { t } = useI18n()
  const systemPaths = useSystemPaths()
  const groupProxyMode = isGroupProxyAssistant(assistant)
  const displayModelId = useMemo(
    () => resolveGroupProxyAssistantModelId(assistant, activeSession),
    [assistant, activeSession],
  )
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')
  const [busy, setBusy] = useState(false)
  const form = useAgentSettingsFormState(assistant, displayModelId)
  const { formState, ...formSetters } = form
  const {
    name,
    description,
    systemPrompt,
    modelId,
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
    temperature,
    maxTokens,
    environmentVariables,
    translationLanguages,
  } = formState

  const effectiveWorkingDirectory = getEffectiveWorkingDirectory(
    workingDirectory || undefined,
    workspace,
    systemPaths,
  )
  const tabs = useMemo(
    () => getAgentSettingsTabs(t).map((tab) => ({ ...tab, id: tab.id as SettingsTab })),
    [t],
  )
  const modelOptions = useMemo(() => buildModelOptions(providers), [providers])
  const displayAssistantName = useMemo(
    () =>
      groupProxyMode
        ? translateGroupFormattedAgentName(resolveGroupProxyAssistantDisplayName(assistant), t)
        : translateAssistantName(assistant.name, t),
    [assistant, groupProxyMode, t],
  )
  const displayName = useMemo(
    () =>
      groupProxyMode
        ? translateGroupFormattedAgentName(name, t)
        : translateAssistantName(name, t),
    [groupProxyMode, name, t],
  )
  const settingsTitleName = useMemo(() => {
    const trimmed = name.trim()
    if (groupProxyMode || !trimmed || trimmed === assistant.name) {
      return displayAssistantName
    }
    return groupProxyMode
      ? translateGroupFormattedAgentName(trimmed, t)
      : translateAssistantName(trimmed, t)
  }, [assistant.name, displayAssistantName, groupProxyMode, name, t])
  const displaySystemPrompt = useMemo(
    () => translateSystemPrompt(systemPrompt, t),
    [systemPrompt, t],
  )
  const displayDescription = useMemo(
    () => translateAssistantDescription(description, t),
    [description, t],
  )
  const sharedModelLabel = useMemo(
    () => formatModelDisplayLabel(displayModelId, providers),
    [displayModelId, providers],
  )

  const getParameters = useCallback(
    () => buildAgentSettingsParameters(assistant, formState),
    [assistant, formState],
  )

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
    formSetters.setWorkingDirectory(path)
    void save({ parameters: { ...getParameters(), workingDirectory: path } })
  }

  const handleRemoveWorkingDirectory = () => {
    formSetters.setWorkingDirectory('')
    void save({ parameters: { ...getParameters(), workingDirectory: undefined } })
  }

  const updateTranslationLanguage = (index: 0 | 1, value: TranslationLanguage) => {
    const next: [TranslationLanguage, TranslationLanguage] = [...translationLanguages]
    next[index] = value
    if (next[0] === next[1]) {
      next[1] = next[0] === 'zh' ? 'en' : 'zh'
    }
    formSetters.setTranslationLanguages(next)
    void save({ parameters: { ...getParameters(), translationLanguages: next } })
  }

  const handleSaveAndClose = async (onClose: () => void) => {
    await save({
      name: name.trim() || assistant.name,
      description: description || null,
      systemPrompt,
      ...(groupProxyMode ? {} : { modelId }),
      parameters: getParameters(),
    })
    onClose()
  }

  return {
    t,
    assistant,
    providers,
    groupProxyMode,
    activeTab,
    setActiveTab,
    tabs,
    name,
    description,
    systemPrompt,
    modelId,
    workingDirectory,
    effectiveWorkingDirectory,
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
    temperature,
    maxTokens,
    environmentVariables,
    translationLanguages,
    busy,
    modelOptions,
    displayName,
    settingsTitleName,
    displaySystemPrompt,
    displayDescription,
    sharedModelLabel,
    getParameters,
    save,
    handleSelectWorkingDirectory,
    handleRemoveWorkingDirectory,
    updateTranslationLanguage,
    handleSaveAndClose,
    ...formSetters,
  }
}
