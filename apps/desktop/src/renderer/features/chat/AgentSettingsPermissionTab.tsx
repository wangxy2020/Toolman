import { useMemo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { getPermissionModes } from '../../i18n/agent-labels'
import type { PermissionMode } from './agent-settings-constants'

interface Props {
  value: PermissionMode
  autonomousMode: boolean
  longTaskMode: boolean
  onChange: (mode: PermissionMode) => void
  onLongTaskModeChange: (enabled: boolean) => void
}

export function AgentSettingsPermissionTab({
  value,
  autonomousMode,
  longTaskMode,
  onChange,
  onLongTaskModeChange,
}: Props) {
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
      ) : longTaskMode ? (
        <p className="tm-agent-permission-effective-hint">
          {t('agent.permissionTab.effectiveLongTask')}
        </p>
      ) : (
        <p className="tm-agent-permission-effective-hint">
          {t('agent.permissionTab.effectiveNormal', { mode: effectiveLabel?.title ?? value })}
        </p>
      )}
      <div className="tm-perm-grid">
        {permissionModes.map((mode) => {
          const selected = !longTaskMode && value === mode.id
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

      <div className="tm-perm-long-task-section">
        <button
          type="button"
          className={`tm-perm-card tm-perm-card--long-task ${longTaskMode ? 'tm-perm-card--active' : ''}`}
          onClick={() => onLongTaskModeChange(true)}
          disabled={autonomousMode}
          data-testid="long-task-mode-setting"
        >
          {longTaskMode && <span className="tm-perm-card-check">✓</span>}
          <div className="tm-perm-card-title">{t('agent.permissionTab.longTaskMode.title')}</div>
          <div className="tm-perm-card-desc">{t('agent.permissionTab.longTaskMode.description')}</div>
        </button>
      </div>
    </div>
  )
}
