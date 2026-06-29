import { useCallback } from 'react'
import type { MessageSettings } from '../chat/message-settings'
import { messageFontSizePx } from '../chat/message-settings'
import {
  resetSidebarModules,
  THEME_COLOR_PRESETS,
  type AppFontFamily,
  type AppSettings,
} from './app-settings'
import { getNavModuleDef, LOCKED_NAV_MODULE, ALL_MENU_MODULES_ORDERED, type NavModuleId } from './nav-modules'
import { SettingsToggle } from './SettingsShared'
import { useI18n } from '../../i18n/useI18n'
import {
  DisplayCard,
  DisplayRow,
  MenuModuleColumn,
  NavPositionSegment,
  ThemeSegment,
  ZoomControl,
} from './display-settings-components'

interface Props {
  appSettings: AppSettings
  messageSettings: MessageSettings
  onAppSettingsChange: (patch: Partial<AppSettings>) => void
  onMessageSettingsChange: (patch: Partial<MessageSettings>) => void
}

export function DisplaySettingsPanel({
  appSettings,
  messageSettings,
  onAppSettingsChange,
  onMessageSettingsChange,
}: Props) {
  const { t } = useI18n()
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
    { value: 'system', label: t('settings.display.fontSystem') },
    { value: 'serif', label: t('settings.display.fontSerif') },
    { value: 'mono', label: t('settings.display.fontMono') },
  ]

  return (
    <>
      <DisplayCard title={t('settings.display.title')}>
        <DisplayRow label={t('settings.display.theme')}>
          <ThemeSegment value={appSettings.theme} onChange={(theme) => patchApp({ theme })} />
        </DisplayRow>

        <DisplayRow label={t('settings.display.themeColor')}>
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

        <DisplayRow label={t('settings.display.transparentWindow')}>
          <SettingsToggle
            checked={appSettings.transparentWindow}
            onChange={(transparentWindow) => patchApp({ transparentWindow })}
          />
        </DisplayRow>
      </DisplayCard>

      <DisplayCard title={t('settings.display.navTitle')} badge>
        <DisplayRow label={t('settings.display.navPosition')}>
          <NavPositionSegment
            value={appSettings.navBarPosition}
            onChange={(navBarPosition) => patchApp({ navBarPosition })}
          />
        </DisplayRow>
      </DisplayCard>

      <DisplayCard title={t('settings.display.zoomTitle')}>
        <DisplayRow label={t('settings.display.zoom')}>
          <ZoomControl
            value={appSettings.zoomLevel}
            onChange={(zoomLevel) => patchApp({ zoomLevel })}
          />
        </DisplayRow>
      </DisplayCard>

      <DisplayCard title={t('settings.display.fontTitle')} badge>
        <DisplayRow label={t('settings.display.uiFont')}>
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
        <DisplayRow label={t('settings.display.messageFontSize')}>
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
        <DisplayRow label={t('settings.display.messageStyle')}>
          <select
            className="tm-settings-select"
            value={messageSettings.messageStyle}
            onChange={(e) =>
              onMessageSettingsChange({
                messageStyle: e.target.value as MessageSettings['messageStyle'],
              })
            }
          >
            <option value="concise">{t('settings.display.messageStyleConcise')}</option>
            <option value="default">{t('settings.display.messageStyleDefault')}</option>
            <option value="detailed">{t('settings.display.messageStyleDetailed')}</option>
          </select>
        </DisplayRow>
      </DisplayCard>

      <DisplayCard
        title={t('settings.display.menuTitle')}
        action={
          <button type="button" className="tm-display-reset-btn" onClick={handleResetMenu}>
            {t('common.reset')}
          </button>
        }
      >
        <div className="tm-menu-module-columns">
          <MenuModuleColumn
            title={t('settings.display.menuVisible')}
            modules={appSettings.sidebarVisibleModules}
            canClose={(id) => getNavModuleDef(id).closable}
            onCloseItem={moveToHidden}
          />
          <MenuModuleColumn
            title={t('settings.display.menuHidden')}
            modules={appSettings.sidebarHiddenModules}
            canClose={() => true}
            onCloseItem={moveToVisible}
          />
        </div>
        <p className="tm-display-hint">{t('settings.display.menuHint')}</p>
      </DisplayCard>
    </>
  )
}
