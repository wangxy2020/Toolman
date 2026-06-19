import { PERMISSION_MODES, type PermissionMode } from './agent-settings-constants'

interface Props {
  value: PermissionMode
  autonomousMode: boolean
  onChange: (mode: PermissionMode) => void
}

export function AgentSettingsPermissionTab({ value, autonomousMode, onChange }: Props) {
  const effectiveMode: PermissionMode = autonomousMode ? 'full-auto' : value
  const effectiveLabel = PERMISSION_MODES.find((mode) => mode.id === effectiveMode)

  return (
    <div className="tm-agent-tab-panel">
      <h3 className="tm-agent-tab-title">权限模式</h3>
      {autonomousMode ? (
        <p className="tm-agent-permission-effective-hint">
          已开启<strong>自主模式</strong>，实际生效为「全自动模式」：写入与执行类工具无需逐项授权。
        </p>
      ) : (
        <p className="tm-agent-permission-effective-hint">
          当前生效：{effectiveLabel?.title ?? value}。读取类工具自动放行；写入与执行类工具每次需授权（Bash
          预授权开启时除外）。
        </p>
      )}
      <div className="tm-perm-grid">
        {PERMISSION_MODES.map((mode) => {
          const selected = value === mode.id
          return (
            <button
              key={mode.id}
              type="button"
              className={`tm-perm-card ${selected ? 'tm-perm-card--active' : ''}`}
              onClick={() => onChange(mode.id)}
              disabled={autonomousMode}
            >
              {selected && <span className="tm-perm-card-check">✓</span>}
              <div className="tm-perm-card-title">{mode.title}</div>
              <div className="tm-perm-card-desc">{mode.description}</div>
              {mode.warning && (
                <div className="tm-perm-card-warn">⚠ {mode.warning}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
