import { AgentSettingsAdvancedTab } from './AgentSettingsAdvancedTab'
import { AgentSettingsKnowledgeTab } from './AgentSettingsKnowledgeTab'
import { AgentSettingsPermissionTab } from './AgentSettingsPermissionTab'
import { AgentSettingsSkillsTab } from './AgentSettingsSkillsTab'
import { AgentSettingsToolsTab } from './AgentSettingsToolsTab'
import type { useAgentSettingsModal } from './useAgentSettingsModal'

type AgentSettingsState = ReturnType<typeof useAgentSettingsModal>

export function AgentSettingsModalSecondaryTabs({ state }: { state: AgentSettingsState }) {
  const {
    t,
    assistant,
    activeTab,
    systemPrompt,
    setSystemPrompt,
    permissionMode,
    setPermissionMode,
    autonomousMode,
    toolStates,
    setToolStates,
    mcpServerIds,
    setMcpServerIds,
    workingDirectory,
    environmentVariables,
    skillIds,
    setSkillIds,
    kbIds,
    setKbIds,
    kbTopK,
    setKbTopK,
    kbScoreThreshold,
    setKbScoreThreshold,
    kbSettings,
    setKbSettings,
    sessionRoundLimit,
    setSessionRoundLimit,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    setEnvironmentVariables,
    displaySystemPrompt,
    getParameters,
    save,
  } = state

  if (activeTab === 'prompt') {
    return (
      <div className="tm-agent-settings-form">
        <div className="tm-agent-setting-block">
          <label className="tm-agent-setting-label">{t('agent.fields.systemPrompt')}</label>
          <textarea
            className="tm-agent-setting-textarea"
            rows={10}
            value={displaySystemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={() => {
              if (systemPrompt !== assistant.systemPrompt) {
                void save({ systemPrompt })
              }
            }}
          />
        </div>
      </div>
    )
  }

  if (activeTab === 'permission') {
    return (
      <AgentSettingsPermissionTab
        value={permissionMode}
        autonomousMode={autonomousMode}
        onChange={(mode) => {
          setPermissionMode(mode)
          void save({ parameters: { ...getParameters(), permissionMode: mode } })
        }}
      />
    )
  }

  if (activeTab === 'tools') {
    return (
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
    )
  }

  if (activeTab === 'skills') {
    return (
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
    )
  }

  if (activeTab === 'knowledge') {
    return (
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
    )
  }

  if (activeTab === 'advanced') {
    return (
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
    )
  }

  return null
}
