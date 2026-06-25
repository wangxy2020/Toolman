import { useMemo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { getPermissionModes } from '../../i18n/agent-labels'
import type { PermissionMode } from './agent-settings-constants'

interface Props {
  value: PermissionMode
  autonomousMode: boolean
  onChange: (mode: PermissionMode) => void
}

export function AgentSettingsPermissionTab({ value, autonomousMode, onChange }: Props) {
  const { t } = useI18n()
  const permissionModes = useMemo(() => getPermissionModes(t), [t])
  const effectiveMode: PermissionMode = autonomousMode ? 'full-auto' : value
  const effectiveLabel = permissionModes.find((mode) => mode.id === effectiveMode)

  return (
    <div className="tm-agent-tab-panel">
      <h3 className="tm-agent-tab-title">{t('agent.permissionTab.title')}</h3>
      {autonomousMode ? (
        <p className="tm-agent-permission-effective-hint">
          {t('agent.permissionTab.autonomousActive')}
        </p>
      ) : (
        <p className="tm-agent-permission-effective-hint">
          {t('agent.permissionTab.effectiveNormal', { mode: effectiveLabel?.title ?? value })}
        </p>
      )}
      <div className="tm-perm-grid">
        {permissionModes.map((mode) => {
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
