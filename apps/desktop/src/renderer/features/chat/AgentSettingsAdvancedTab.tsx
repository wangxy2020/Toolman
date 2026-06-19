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
  return (
    <div className="tm-agent-tab-panel">
      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          温度 (Temperature)
          <HelpHint title="越高越有创造性，越低越稳定；范围 0–2" />
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
          最大输出 Token
          <HelpHint title="限制单次回复的最大 token 数；留空表示使用模型默认值" />
        </label>
        <input
          type="number"
          className="tm-agent-advanced-input"
          min={1}
          placeholder="默认"
          value={maxTokens}
          onChange={(event) => onMaxTokensChange(event.target.value)}
          onBlur={onMaxTokensBlur}
        />
      </div>

      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          会话轮次上限
          <HelpHint title="限制单次自主会话的最大轮次" />
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
          数值越高可自主运行越久；数值越低更易控制。
        </p>
      </div>

      <div className="tm-agent-advanced-block">
        <label className="tm-agent-advanced-label">
          环境变量
          <HelpHint title="为智能体运行环境注入自定义变量" />
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
