import { useEffect, useMemo, useState } from 'react'
import type { Assistant } from '@toolman/shared'
import {
  buildAgentSettingsFormState,
  type AgentSettingsFormState,
} from './agent-settings-modal-state'

export function useAgentSettingsFormState(assistant: Assistant, displayModelId: string) {
  const initial = useMemo(
    () => buildAgentSettingsFormState(assistant, displayModelId),
    [assistant, displayModelId],
  )
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt)
  const [modelId, setModelId] = useState(initial.modelId)
  const [workingDirectory, setWorkingDirectory] = useState(initial.workingDirectory)
  const [autonomousMode, setAutonomousMode] = useState(initial.autonomousMode)
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(initial.heartbeatEnabled)
  const [heartbeatInterval, setHeartbeatInterval] = useState(initial.heartbeatInterval)
  const [permissionMode, setPermissionMode] = useState(initial.permissionMode)
  const [toolStates, setToolStates] = useState(initial.toolStates)
  const [mcpServerIds, setMcpServerIds] = useState(initial.mcpServerIds)
  const [skillIds, setSkillIds] = useState(initial.skillIds)
  const [kbIds, setKbIds] = useState(initial.kbIds)
  const [kbTopK, setKbTopK] = useState(initial.kbTopK)
  const [kbScoreThreshold, setKbScoreThreshold] = useState(initial.kbScoreThreshold)
  const [kbSettings, setKbSettings] = useState(initial.kbSettings)
  const [sessionRoundLimit, setSessionRoundLimit] = useState(initial.sessionRoundLimit)
  const [temperature, setTemperature] = useState(initial.temperature)
  const [maxTokens, setMaxTokens] = useState(initial.maxTokens)
  const [environmentVariables, setEnvironmentVariables] = useState(initial.environmentVariables)
  const [translationLanguages, setTranslationLanguages] = useState(initial.translationLanguages)

  useEffect(() => {
    const next = buildAgentSettingsFormState(assistant, displayModelId)
    setName(next.name)
    setDescription(next.description)
    setSystemPrompt(next.systemPrompt)
    setModelId(next.modelId)
    setWorkingDirectory(next.workingDirectory)
    setAutonomousMode(next.autonomousMode)
    setHeartbeatEnabled(next.heartbeatEnabled)
    setHeartbeatInterval(next.heartbeatInterval)
    setPermissionMode(next.permissionMode)
    setToolStates(next.toolStates)
    setMcpServerIds(next.mcpServerIds)
    setSkillIds(next.skillIds)
    setKbIds(next.kbIds)
    setKbTopK(next.kbTopK)
    setKbScoreThreshold(next.kbScoreThreshold)
    setKbSettings(next.kbSettings)
    setSessionRoundLimit(next.sessionRoundLimit)
    setTemperature(next.temperature)
    setMaxTokens(next.maxTokens)
    setEnvironmentVariables(next.environmentVariables)
    setTranslationLanguages(next.translationLanguages)
  }, [assistant, displayModelId])

  const formState: AgentSettingsFormState = {
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
  }

  return {
    formState,
    setName,
    setDescription,
    setSystemPrompt,
    setModelId,
    setWorkingDirectory,
    setAutonomousMode,
    setHeartbeatEnabled,
    setHeartbeatInterval,
    setPermissionMode,
    setToolStates,
    setMcpServerIds,
    setSkillIds,
    setKbIds,
    setKbTopK,
    setKbScoreThreshold,
    setKbSettings,
    setSessionRoundLimit,
    setTemperature,
    setMaxTokens,
    setEnvironmentVariables,
    setTranslationLanguages,
  }
}
