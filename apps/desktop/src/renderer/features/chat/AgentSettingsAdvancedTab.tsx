import { useI18n } from '../../i18n/useI18n'

interface Props {
  sessionRoundLimit: number
  environmentVariables: string
  temperature: number
  maxTokens: string
  onSessionRoundLimitChange: (value: number) => void
  onSessionRoundLimitBlur: () => void
  onEnvironmentVariablesChange: (value: string) => void
  onEnvironmentVariablesBlur: () => void
  onTemperatureChange: (value: number) => void
  onTemperatureBlur: () => void
  onMaxTokensChange: (value: string) => void
  onMaxTokensBlur: () => void
}

function HelpHint({ title }: { title: string }) {
  return (
    <button type="button" className="tm-agent-help" title={title}>
      i
    </button>
  )
}

export function AgentSettingsAdvancedTab({
  sessionRoundLimit,
  environmentVariables,
  temperature,
  maxTokens,
  onSessionRoundLimitChange,
  onSessionRoundLimitBlur,
  onEnvironmentVariablesChange,
  onEnvironmentVariablesBlur,
  onTemperatureChange,
  onTemperatureBlur,
  onMaxTokensChange,
  onMaxTokensBlur,
}: Props) {
  const { t } = useI18n()
  return (
    <div className="tm-agent-tab-panel">
      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          {t('agent.fields.temperature')}
          <HelpHint title={t('agent.fields.temperatureHint')} />
        </label>
        <div className="tm-notes-settings-slider-row">
          <input
            type="range"
            className="tm-msg-font-slider"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(event) => onTemperatureChange(Number(event.target.value))}
            onBlur={onTemperatureBlur}
          />
          <span className="tm-notes-settings-slider-value">{temperature.toFixed(1)}</span>
        </div>
      </div>

      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          {t('agent.fields.maxTokens')}
          <HelpHint title={t('agent.fields.maxTokensHint')} />
        </label>
        <input
          type="number"
          className="tm-agent-advanced-input"
          min={1}
          placeholder={t('agent.fields.maxTokensPlaceholder')}
          value={maxTokens}
          onChange={(event) => onMaxTokensChange(event.target.value)}
          onBlur={onMaxTokensBlur}
        />
      </div>

      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          {t('agent.fields.sessionRoundLimit')}
          <HelpHint title={t('agent.fields.sessionRoundLimitHint')} />
        </label>
        <input
          type="number"
          className="tm-agent-advanced-input"
          min={1}
          value={sessionRoundLimit}
          onChange={(e) => onSessionRoundLimitChange(Number(e.target.value) || 100)}
          onBlur={onSessionRoundLimitBlur}
        />
        <p className="tm-agent-advanced-hint">
          {t('agent.fields.sessionRoundLimitNote')}
        </p>
      </div>

      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          {t('agent.fields.envVars')}
          <HelpHint title={t('agent.fields.envVarsHint')} />
        </label>
        <textarea
          className="tm-agent-advanced-textarea"
          rows={5}
          value={environmentVariables}
          placeholder={'KEY=value\nANOTHER_KEY=value'}
          onChange={(e) => onEnvironmentVariablesChange(e.target.value)}
          onBlur={onEnvironmentVariablesBlur}
        />
      </div>
    </div>
  )
}
