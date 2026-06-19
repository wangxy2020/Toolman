import { useCallback } from 'react'
import type { MessageSettings } from '../chat/message-settings'
import { messageFontSizePx } from '../chat/message-settings'
import {
  resetSidebarModules,
  THEME_COLOR_PRESETS,
  type AppFontFamily,
  type AppSettings,
  type AppTheme,
  type NavBarPosition,
} from './app-settings'
import { getNavModuleDef, LOCKED_NAV_MODULE, ALL_MENU_MODULES_ORDERED, type NavModuleId } from './nav-modules'
import { SettingsRow, SettingsSection, SettingsToggle } from './SettingsShared'
import { IconMoon, IconMonitor, IconRefresh, IconSun } from '../../components/nav-module-icons'

interface Props {
  appSettings: AppSettings
  messageSettings: MessageSettings
  onAppSettingsChange: (patch: Partial<AppSettings>) => void
  onMessageSettingsChange: (patch: Partial<MessageSettings>) => void
}

function DisplayRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <SettingsRow label={label}>{children}</SettingsRow>
}

function DisplayCard({
  title,
  badge,
  action,
  children,
}: {
  title: string
  badge?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <SettingsSection title={title} badge={badge} action={action}>
      {children}
    </SettingsSection>
  )
}

function ThemeSegment({
  value,
  onChange,
}: {
  value: AppTheme
  onChange: (theme: AppTheme) => void
}) {
  const options: { value: AppTheme; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: '浅色', icon: <IconSun size={14} /> },
    { value: 'dark', label: '深色', icon: <IconMoon size={14} /> },
    { value: 'system', label: '系统', icon: <IconMonitor size={14} /> },
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

function NavPositionSegment({
  value,
  onChange,
}: {
  value: NavBarPosition
  onChange: (position: NavBarPosition) => void
}) {
  const options: { value: NavBarPosition; label: string; disabled?: boolean }[] = [
    { value: 'left', label: '左侧' },
    { value: 'top', label: '顶部', disabled: true },
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
          title={opt.disabled ? '暂不可用' : undefined}
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

function ZoomControl({
  value,
  onChange,
}: {
  value: number
  onChange: (zoom: number) => void
}) {
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
        aria-label="缩小"
      >
        −
      </button>
      <span className="tm-zoom-value">{value}%</span>
      <button
        type="button"
        className="tm-zoom-btn"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label="放大"
      >
        +
      </button>
      <button
        type="button"
        className="tm-zoom-btn tm-zoom-btn--icon"
        onClick={() => onChange(100)}
        title="重置缩放"
        aria-label="重置缩放"
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
  const def = getNavModuleDef(moduleId)
  const Icon = def.icon

  return (
    <div className="tm-menu-module-item">
      {showClose && onClose && (
        <button
          type="button"
          className="tm-menu-module-close"
          title="移除"
          aria-label={`移除 ${def.label}`}
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      )}
      <Icon size={18} />
      <span>{def.label}</span>
    </div>
  )
}

function MenuModuleColumn({
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

export function DisplaySettingsPanel({
  appSettings,
  messageSettings,
  onAppSettingsChange,
  onMessageSettingsChange,
}: Props) {
  const patchApp = useCallback(
    (patch: Partial<AppSettings>) => onAppSettingsChange(patch),
    [onAppSettingsChange],
  )

  const moveToVisible = (id: NavModuleId) => {
    if (appSettings.sidebarVisibleModules.includes(id)) return
    const visibleSet = new Set([...appSettings.sidebarVisibleModules, id, LOCKED_NAV_MODULE])
    const visible = ALL_MENU_MODULES_ORDERED.filter((m) => visibleSet.has(m))
    const hidden = ALL_MENU_MODULES_ORDERED.filter(
      (m) => m !== LOCKED_NAV_MODULE && !visibleSet.has(m),
    )
    patchApp({ sidebarVisibleModules: visible, sidebarHiddenModules: hidden })
  }

  const moveToHidden = (id: NavModuleId) => {
    if (id === LOCKED_NAV_MODULE) return
    const visibleSet = new Set(appSettings.sidebarVisibleModules)
    visibleSet.delete(id)
    visibleSet.add(LOCKED_NAV_MODULE)
    const visible = ALL_MENU_MODULES_ORDERED.filter((m) => visibleSet.has(m))
    const hidden = ALL_MENU_MODULES_ORDERED.filter(
      (m) => m !== LOCKED_NAV_MODULE && !visibleSet.has(m),
    )
    patchApp({ sidebarVisibleModules: visible, sidebarHiddenModules: hidden })
  }

  const handleResetMenu = () => {
    patchApp(resetSidebarModules())
  }

  const fontOptions: { value: AppFontFamily; label: string }[] = [
    { value: 'system', label: '系统默认' },
    { value: 'serif', label: '衬线字体' },
    { value: 'mono', label: '等宽字体' },
  ]

  return (
    <>
      <DisplayCard title="显示设置">
        <DisplayRow label="主题">
          <ThemeSegment value={appSettings.theme} onChange={(theme) => patchApp({ theme })} />
        </DisplayRow>

        <DisplayRow label="主题颜色">
          <div className="tm-theme-colors">
            {THEME_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                className={`tm-theme-swatch ${appSettings.themeColor === color ? 'tm-theme-swatch--active' : ''}`}
                style={{ backgroundColor: color }}
                title={color}
                onClick={() => patchApp({ themeColor: color })}
              />
            ))}
            <label className="tm-theme-custom">
              <input
                type="color"
                className="tm-theme-custom-input"
                value={appSettings.themeColor}
                onChange={(e) => patchApp({ themeColor: e.target.value })}
              />
              <input
                type="text"
                className="tm-theme-custom-hex"
                value={appSettings.themeColor}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) patchApp({ themeColor: v })
                }}
              />
            </label>
          </div>
        </DisplayRow>

        <DisplayRow label="透明窗口">
          <SettingsToggle
            checked={appSettings.transparentWindow}
            onChange={(transparentWindow) => patchApp({ transparentWindow })}
          />
        </DisplayRow>
      </DisplayCard>

      <DisplayCard title="导航栏设置" badge>
        <DisplayRow label="导航栏位置">
          <NavPositionSegment
            value={appSettings.navBarPosition}
            onChange={(navBarPosition) => patchApp({ navBarPosition })}
          />
        </DisplayRow>
      </DisplayCard>

      <DisplayCard title="缩放设置">
        <DisplayRow label="缩放">
          <ZoomControl
            value={appSettings.zoomLevel}
            onChange={(zoomLevel) => patchApp({ zoomLevel })}
          />
        </DisplayRow>
      </DisplayCard>

      <DisplayCard title="字体设置" badge>
        <DisplayRow label="界面字体">
          <select
            className="tm-settings-select"
            value={appSettings.fontFamily}
            onChange={(e) => {
              const fontFamily = e.target.value as AppFontFamily
              patchApp({ fontFamily })
              if (fontFamily === 'serif') {
                onMessageSettingsChange({ useSerifFont: true })
              } else if (fontFamily === 'system') {
                onMessageSettingsChange({ useSerifFont: false })
              }
            }}
          >
            {fontOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </DisplayRow>
        <DisplayRow label="消息字号">
          <div className="tm-settings-range-wrap">
            <input
              type="range"
              className="tm-settings-range"
              min={0}
              max={100}
              value={messageSettings.messageFontSize}
              onChange={(e) =>
                onMessageSettingsChange({ messageFontSize: Number(e.target.value) })
              }
            />
            <span className="tm-settings-range-value">
              {messageFontSizePx(messageSettings.messageFontSize)}px
            </span>
          </div>
        </DisplayRow>
        <DisplayRow label="消息样式">
          <select
            className="tm-settings-select"
            value={messageSettings.messageStyle}
            onChange={(e) =>
              onMessageSettingsChange({
                messageStyle: e.target.value as MessageSettings['messageStyle'],
              })
            }
          >
            <option value="concise">简洁</option>
            <option value="default">默认</option>
            <option value="detailed">详细</option>
          </select>
        </DisplayRow>
      </DisplayCard>

      <DisplayCard
        title="菜单设置"
        action={
          <button type="button" className="tm-display-reset-btn" onClick={handleResetMenu}>
            重置
          </button>
        }
      >
        <div className="tm-menu-module-columns">
          <MenuModuleColumn
            title="显示的图标"
            modules={appSettings.sidebarVisibleModules}
            canClose={(id) => getNavModuleDef(id).closable}
            onCloseItem={moveToHidden}
          />
          <MenuModuleColumn
            title="隐藏的图标"
            modules={appSettings.sidebarHiddenModules}
            canClose={() => true}
            onCloseItem={moveToVisible}
          />
        </div>
        <p className="tm-display-hint">
          鼠标悬停图标可点击右上角关闭：显示的图标将移入隐藏列表并从左侧菜单移除；隐藏的图标将恢复显示。智能体不可关闭。
        </p>
      </DisplayCard>
    </>
  )
}
