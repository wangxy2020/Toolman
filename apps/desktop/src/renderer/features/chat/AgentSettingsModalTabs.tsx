import { formatModelDisplayLabel } from './model-utils'
import { TRANSLATION_LANGUAGE_OPTIONS } from './translation-utils'
import type { TranslationLanguage } from '@toolman/shared'
import {
  AgentSettingsHelpHint,
  AgentSettingsToggle,
} from './agent-settings-modal-components'
import type { useAgentSettingsModal } from './useAgentSettingsModal'

type AgentSettingsState = ReturnType<typeof useAgentSettingsModal>

export function AgentSettingsModalBasicTab({ state }: { state: AgentSettingsState }) {
  const {
    t,
    assistant,
    providers,
    groupProxyMode,
    name,
    setName,
    description,
    setDescription,
    modelId,
    setModelId,
    workingDirectory,
    effectiveWorkingDirectory,
    autonomousMode,
    setAutonomousMode,
    heartbeatEnabled,
    setHeartbeatEnabled,
    heartbeatInterval,
    setHeartbeatInterval,
    translationLanguages,
    modelOptions,
    displayName,
    displayDescription,
    sharedModelLabel,
    getParameters,
    save,
    handleSelectWorkingDirectory,
    handleRemoveWorkingDirectory,
    updateTranslationLanguage,
  } = state

  return (
    <div className="tm-agent-settings-form">
      <div className="tm-agent-setting-row">
        <label className="tm-agent-setting-label" htmlFor="agent-settings-name">
          {t('common.name')}
        </label>
        <input
          id="agent-settings-name"
          className="tm-agent-setting-input"
          value={displayName}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim()
            if (!trimmed || trimmed === assistant.name) return
            void save({ name: trimmed })
          }}
        />
      </div>

      <div className="tm-agent-setting-row">
        <div className="tm-agent-setting-label-group">
          <label className="tm-agent-setting-label" htmlFor="agent-settings-model">
            {t('agent.fields.model')}
          </label>
          <AgentSettingsHelpHint title={t('agent.fields.modelHint')} />
        </div>
        {groupProxyMode ? (
          <input
            id="agent-settings-model"
            className="tm-agent-setting-input"
            readOnly
            value={sharedModelLabel}
            title={t('agent.fields.groupModelLocked')}
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
          {t('agent.fields.workingDirectory')}
        </label>
        <div className="tm-agent-workdir-field">
          <div className="tm-agent-workdir-input-group">
            <input
              id="agent-settings-workdir"
              className="tm-agent-workdir-input"
              readOnly
              value={effectiveWorkingDirectory}
              placeholder={t('agent.fields.workingDirectoryUnset')}
              title={effectiveWorkingDirectory}
            />
            <button
              type="button"
              className="tm-agent-workdir-browse"
              onClick={() => void handleSelectWorkingDirectory()}
            >
              {t('agent.browse')}
            </button>
          </div>
          {workingDirectory ? (
            <button
              type="button"
              className="tm-agent-workdir-reset"
              onClick={handleRemoveWorkingDirectory}
            >
              {t('agent.fields.restoreWorkspaceDefault')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="tm-agent-toggle-card">
        <div className="tm-agent-toggle-card-item">
          <span className="tm-agent-toggle-card-label">
            {t('agent.fields.autonomousMode')}
            <AgentSettingsHelpHint title={t('agent.fields.autonomousModeHint')} />
          </span>
          <AgentSettingsToggle
            checked={autonomousMode}
            onChange={(value) => {
              setAutonomousMode(value)
              void save({ parameters: { ...getParameters(), autonomousMode: value } })
            }}
          />
        </div>
        <div className="tm-agent-toggle-card-item">
          <span className="tm-agent-toggle-card-label">
            {t('agent.fields.heartbeat')}
            <AgentSettingsHelpHint title={t('agent.fields.heartbeatHint')} />
          </span>
          <AgentSettingsToggle
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
          {t('agent.fields.heartbeatInterval')}
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
          <span className="tm-agent-setting-label">{t('agent.fields.translationTarget')}</span>
          <AgentSettingsHelpHint title={t('agent.fields.translationTargetHint')} />
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
                {t(`agent.languages.${opt.value}`)}
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
                {t(`agent.languages.${opt.value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tm-agent-setting-block">
        <label className="tm-agent-setting-label" htmlFor="agent-settings-description">
          {t('common.description')}
        </label>
        <textarea
          id="agent-settings-description"
          className="tm-agent-setting-textarea"
          rows={4}
          value={displayDescription}
          placeholder={t('agent.optional')}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== (assistant.description ?? '')) {
              void save({ description: description || null })
            }
          }}
        />
      </div>
    </div>
  )
}
