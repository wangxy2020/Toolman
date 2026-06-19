import { IconPanelLeft, IconSearch, IconSettings } from '../icons'
import { IconMoon, IconMonitor, IconSun } from '../nav-module-icons'
import {
  appThemeLabel,
  cycleAppTheme,
  type AppSettings,
  type AppTheme,
} from '../../features/settings/app-settings'
import { getNavModuleDef } from '../../features/settings/nav-modules'
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
  return (
    <>
      {moduleIds.map((moduleId) => {
        const def = getNavModuleDef(moduleId)
        const Icon = def.icon
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
            title={canNavigate ? def.label : `${def.label}（即将推出）`}
            aria-label={def.label}
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
  const nextTheme = cycleAppTheme(theme)

  return (
    <button
      type="button"
      className="tm-nav-item tm-nav-theme"
      title={`主题：${appThemeLabel(theme)}，点击切换为${appThemeLabel(nextTheme)}`}
      aria-label={`切换主题，当前${appThemeLabel(theme)}`}
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
  return (
    <button
      type="button"
      className={`tm-nav-item ${activeView === 'settings' ? 'tm-nav-item--active' : ''}`}
      title="设置"
      aria-label="设置"
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
  searchTitle = '搜索',
  onOpenSearch,
}: Props) {
  if (layout === 'top') {
    return (
      <header className="tm-top-bar">
        <div className="tm-top-bar-leading">
          {onToggleSidebar ? (
            <button
              type="button"
              className="tm-window-chrome-btn"
              title={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
              aria-label={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
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
              title={searchTitle}
              aria-label={searchTitle}
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
