import type { Assistant } from '@toolman/shared'
import type { TranslationLanguage } from '@toolman/shared'
import {
  DEFAULT_PERMISSION_MODE,
  DEFAULT_SESSION_ROUND_LIMIT,
  getDefaultMcpServerIds,
  getDefaultSkillIds,
  getDefaultToolStates,
  type PermissionMode,
} from './agent-settings-constants'
import { normalizeTranslationLanguages } from './translation-utils'

export type AgentSettingsFormState = {
  name: string
  description: string
  systemPrompt: string
  modelId: string
  workingDirectory: string
  autonomousMode: boolean
  heartbeatEnabled: boolean
  heartbeatInterval: number
  permissionMode: PermissionMode
  toolStates: Record<string, boolean>
  mcpServerIds: string[]
  skillIds: string[]
  kbIds: string[]
  kbTopK: number | undefined
  kbScoreThreshold: number | undefined
  kbSettings: Record<string, { topK?: number; scoreThreshold?: number }>
  sessionRoundLimit: number
  temperature: number
  maxTokens: string
  environmentVariables: string
  translationLanguages: [TranslationLanguage, TranslationLanguage]
}

export function buildAgentSettingsFormState(
  assistant: Assistant,
  displayModelId: string,
): AgentSettingsFormState {
  return {
    name: assistant.name,
    description: assistant.description ?? '',
    systemPrompt: assistant.systemPrompt,
    modelId: displayModelId,
    workingDirectory: assistant.parameters.workingDirectory ?? '',
    autonomousMode: assistant.parameters.autonomousMode ?? false,
    heartbeatEnabled: assistant.parameters.heartbeatEnabled ?? false,
    heartbeatInterval: assistant.parameters.heartbeatIntervalMinutes ?? 30,
    permissionMode: assistant.parameters.permissionMode ?? DEFAULT_PERMISSION_MODE,
    toolStates: assistant.parameters.toolStates ?? getDefaultToolStates(),
    mcpServerIds: assistant.parameters.mcpServerIds ?? getDefaultMcpServerIds(),
    skillIds: assistant.parameters.skillIds ?? getDefaultSkillIds(),
    kbIds: assistant.parameters.kbIds ?? [],
    kbTopK: assistant.parameters.kbTopK,
    kbScoreThreshold: assistant.parameters.kbScoreThreshold,
    kbSettings: assistant.parameters.kbSettings ?? {},
    sessionRoundLimit: assistant.parameters.sessionRoundLimit ?? DEFAULT_SESSION_ROUND_LIMIT,
    temperature: assistant.parameters.temperature ?? 0.7,
    maxTokens: assistant.parameters.maxTokens ? String(assistant.parameters.maxTokens) : '',
    environmentVariables: assistant.parameters.environmentVariables ?? '',
    translationLanguages: normalizeTranslationLanguages(assistant.parameters.translationLanguages),
  }
}

export function buildAgentSettingsParameters(
  assistant: Assistant,
  state: AgentSettingsFormState,
): Assistant['parameters'] {
  return {
    temperature: state.temperature,
    topP: assistant.parameters.topP,
    maxTokens: state.maxTokens.trim() ? Number(state.maxTokens) || undefined : undefined,
    workingDirectory: state.workingDirectory || undefined,
    autonomousMode: state.autonomousMode,
    heartbeatEnabled: state.heartbeatEnabled,
    heartbeatIntervalMinutes: state.heartbeatInterval,
    permissionMode: state.permissionMode,
    toolStates: state.toolStates,
    mcpServerIds: state.mcpServerIds,
    skillIds: state.skillIds,
    kbIds: state.kbIds.length > 0 ? state.kbIds : undefined,
    kbTopK: state.kbTopK,
    kbScoreThreshold: state.kbScoreThreshold,
    kbSettings: Object.keys(state.kbSettings).length > 0 ? state.kbSettings : undefined,
    sessionRoundLimit: state.sessionRoundLimit,
    environmentVariables: state.environmentVariables || undefined,
    translationLanguages: state.translationLanguages,
  }
}
