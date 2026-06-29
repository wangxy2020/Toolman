import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { getNavModuleLabel } from '../../i18n/nav-labels'
import type { AppTheme, NavBarPosition } from './app-settings'
import { getNavModuleDef, type NavModuleId } from './nav-modules'
import { SettingsRow, SettingsSection } from './SettingsShared'
import { IconMoon, IconMonitor, IconRefresh, IconSun } from '../../components/nav-module-icons'

export function DisplayRow({ label, children }: { label: string; children: ReactNode }) {
  return <SettingsRow label={label}>{children}</SettingsRow>
}

export function DisplayCard({
  title,
  badge,
  action,
  children,
}: {
  title: string
  badge?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <SettingsSection title={title} badge={badge} action={action}>
      {children}
    </SettingsSection>
  )
}

export function ThemeSegment({
  value,
  onChange,
}: {
  value: AppTheme
  onChange: (theme: AppTheme) => void
}) {
  const { t } = useI18n()
  const options: { value: AppTheme; label: string; icon: ReactNode }[] = [
    { value: 'light', label: t('theme.light'), icon: <IconSun size={14} /> },
    { value: 'dark', label: t('theme.dark'), icon: <IconMoon size={14} /> },
    { value: 'system', label: t('theme.system'), icon: <IconMonitor size={14} /> },
  ]

  return (
    <div className="tm-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`tm-segmented-item ${value === opt.value ? 'tm-segmented-item--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export function NavPositionSegment({
  value,
  onChange,
}: {
  value: NavBarPosition
  onChange: (position: NavBarPosition) => void
}) {
  const { t } = useI18n()
  const options: { value: NavBarPosition; label: string; disabled?: boolean }[] = [
    { value: 'left', label: t('settings.display.navLeft') },
    { value: 'top', label: t('settings.display.navTop'), disabled: true },
  ]

  return (
    <div className="tm-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={[
            'tm-segmented-item',
            value === opt.value ? 'tm-segmented-item--active' : '',
            opt.disabled ? 'tm-segmented-item--disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={opt.disabled}
          title={opt.disabled ? t('common.unavailable') : undefined}
          onClick={() => {
            if (opt.disabled) return
            onChange(opt.value)
          }}
        >
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export function ZoomControl({
  value,
  onChange,
}: {
  value: number
  onChange: (zoom: number) => void
}) {
  const { t } = useI18n()
  const step = 10
  const min = 80
  const max = 150

  return (
    <div className="tm-zoom-control">
      <button
        type="button"
        className="tm-zoom-btn"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label={t('settings.display.zoomOut')}
      >
        −
      </button>
      <span className="tm-zoom-value">{value}%</span>
      <button
        type="button"
        className="tm-zoom-btn"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label={t('settings.display.zoomIn')}
      >
        +
      </button>
      <button
        type="button"
        className="tm-zoom-btn tm-zoom-btn--icon"
        onClick={() => onChange(100)}
        title={t('settings.display.zoomReset')}
        aria-label={t('settings.display.zoomReset')}
      >
        <IconRefresh size={14} />
      </button>
    </div>
  )
}

function MenuModuleItem({
  moduleId,
  showClose,
  onClose,
}: {
  moduleId: NavModuleId
  showClose: boolean
  onClose?: () => void
}) {
  const { t } = useI18n()
  const def = getNavModuleDef(moduleId)
  const Icon = def.icon
  const label = getNavModuleLabel(moduleId, t)

  return (
    <div className="tm-menu-module-item">
      {showClose && onClose && (
        <button
          type="button"
          className="tm-menu-module-close"
          title={t('common.remove')}
          aria-label={`${t('common.remove')} ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      )}
      <Icon size={18} />
      <span>{label}</span>
    </div>
  )
}

export function MenuModuleColumn({
  title,
  modules,
  canClose,
  onCloseItem,
}: {
  title: string
  modules: NavModuleId[]
  canClose: (id: NavModuleId) => boolean
  onCloseItem: (id: NavModuleId) => void
}) {
  return (
    <div className="tm-menu-module-column">
      <div className="tm-menu-module-column-title">{title}</div>
      <div className="tm-menu-module-list">
        {modules.map((id) => (
          <MenuModuleItem
            key={id}
            moduleId={id}
            showClose={canClose(id)}
            onClose={() => onCloseItem(id)}
          />
        ))}
      </div>
    </div>
  )
}
