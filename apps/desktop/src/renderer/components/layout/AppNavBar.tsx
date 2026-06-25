import { IconPanelLeft, IconSearch, IconSettings } from '../icons'
import { IconMoon, IconMonitor, IconSun } from '../nav-module-icons'
import {
  appThemeLabel,
  cycleAppTheme,
  type AppSettings,
  type AppTheme,
} from '../../features/settings/app-settings'
import { getNavModuleDef } from '../../features/settings/nav-modules'
import { getNavModuleLabel } from '../../i18n/nav-labels'
import { useI18n } from '../../i18n/useI18n'
import { UserAccountMenu } from '../../features/user/UserAccountMenu'
import type { AppView } from '../../types/app-view'

interface Props {
  activeView: AppView
  appSettings: AppSettings
  onNavigate: (view: AppView) => void
  onThemeChange: (theme: AppTheme) => void
  layout?: 'side' | 'top'
  sidebarVisible?: boolean
  onToggleSidebar?: () => void
  searchEnabled?: boolean
  searchTitle?: string
  onOpenSearch?: () => void
}

function ThemeToggleIcon({ theme }: { theme: AppTheme }) {
  switch (theme) {
    case 'light':
      return <IconSun size={20} />
    case 'dark':
      return <IconMoon size={20} />
    case 'system':
      return <IconMonitor size={20} />
  }
}

function NavAvatarButton() {
  return <UserAccountMenu />
}

function NavModuleButtons({
  activeView,
  moduleIds,
  onNavigate,
}: {
  activeView: AppView
  moduleIds: AppSettings['sidebarVisibleModules']
  onNavigate: (view: AppView) => void
}) {
  const { t } = useI18n()

  return (
    <>
      {moduleIds.map((moduleId) => {
        const def = getNavModuleDef(moduleId)
        const Icon = def.icon
        const label = getNavModuleLabel(moduleId, t)
        const isActive = def.view != null && activeView === def.view
        const canNavigate = Boolean(def.view)

        return (
          <button
            key={moduleId}
            type="button"
            className={[
              'tm-nav-item',
              isActive ? 'tm-nav-item--active' : '',
              !canNavigate ? 'tm-nav-item--unavailable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={canNavigate ? label : t('nav.moduleUnavailable', { label })}
            aria-label={label}
            disabled={!canNavigate}
            onClick={() => {
              if (def.view) onNavigate(def.view)
            }}
          >
            <Icon />
          </button>
        )
      })}
    </>
  )
}

function ThemeButton({
  theme,
  onThemeChange,
}: {
  theme: AppTheme
  onThemeChange: (theme: AppTheme) => void
}) {
  const { t } = useI18n()
  const nextTheme = cycleAppTheme(theme)
  const currentLabel = appThemeLabel(theme, t)
  const nextLabel = appThemeLabel(nextTheme, t)

  return (
    <button
      type="button"
      className="tm-nav-item tm-nav-theme"
      title={t('theme.switchTitle', { current: currentLabel, next: nextLabel })}
      aria-label={t('theme.switchAria', { current: currentLabel })}
      onClick={() => onThemeChange(nextTheme)}
    >
      <ThemeToggleIcon theme={theme} />
    </button>
  )
}

function SettingsButton({
  activeView,
  onNavigate,
}: {
  activeView: AppView
  onNavigate: (view: AppView) => void
}) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      className={`tm-nav-item ${activeView === 'settings' ? 'tm-nav-item--active' : ''}`}
      title={t('nav.settings')}
      aria-label={t('nav.settings')}
      onClick={() => onNavigate('settings')}
    >
      <IconSettings />
    </button>
  )
}

export function AppNavBar({
  activeView,
  appSettings,
  onNavigate,
  onThemeChange,
  layout = 'side',
  sidebarVisible = true,
  onToggleSidebar,
  searchEnabled = false,
  searchTitle,
  onOpenSearch,
}: Props) {
  const { t } = useI18n()
  const resolvedSearchTitle = searchTitle ?? t('nav.search')
  const sidebarTitle = sidebarVisible ? t('sidebar.hide') : t('sidebar.show')

  if (layout === 'top') {
    return (
      <header className="tm-top-bar">
        <div className="tm-top-bar-leading">
          {onToggleSidebar ? (
            <button
              type="button"
              className="tm-window-chrome-btn"
              title={sidebarTitle}
              aria-label={sidebarTitle}
              onClick={onToggleSidebar}
            >
              <IconPanelLeft collapsed={!sidebarVisible} />
            </button>
          ) : null}
          <NavAvatarButton />
          <NavModuleButtons
            activeView={activeView}
            moduleIds={appSettings.sidebarVisibleModules}
            onNavigate={onNavigate}
          />
        </div>

        <div className="tm-top-bar-fill" />

        <div className="tm-top-bar-trailing">
          {searchEnabled && onOpenSearch ? (
            <button
              type="button"
              className="tm-window-chrome-btn"
              title={resolvedSearchTitle}
              aria-label={resolvedSearchTitle}
              onClick={onOpenSearch}
            >
              <IconSearch />
            </button>
          ) : null}
          <ThemeButton theme={appSettings.theme} onThemeChange={onThemeChange} />
          <SettingsButton activeView={activeView} onNavigate={onNavigate} />
        </div>
      </header>
    )
  }

  return (
    <nav className="tm-nav">
      <NavAvatarButton />
      <NavModuleButtons
        activeView={activeView}
        moduleIds={appSettings.sidebarVisibleModules}
        onNavigate={onNavigate}
      />
      <div className="tm-nav-spacer" />
      <ThemeButton theme={appSettings.theme} onThemeChange={onThemeChange} />
      <SettingsButton activeView={activeView} onNavigate={onNavigate} />
    </nav>
  )
}
