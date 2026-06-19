export type AppTheme = 'system' | 'light' | 'dark'
export type AppLanguage = 'zh-CN' | 'en'
export type NavBarPosition = 'left' | 'top'
export type AppFontFamily = 'system' | 'serif' | 'mono'

export const APP_THEME_ORDER: AppTheme[] = ['light', 'dark', 'system']

export function cycleAppTheme(current: AppTheme): AppTheme {
  const index = APP_THEME_ORDER.indexOf(current)
  const nextIndex = index < 0 ? 0 : (index + 1) % APP_THEME_ORDER.length
  return APP_THEME_ORDER[nextIndex]!
}

export function appThemeLabel(theme: AppTheme): string {
  switch (theme) {
    case 'light':
      return '浅色'
    case 'dark':
      return '深色'
    case 'system':
      return '系统'
    default:
      return theme
  }
}

import type { NavModuleId } from './nav-modules'
import {
  DEFAULT_HIDDEN_NAV_MODULES,
  DEFAULT_VISIBLE_NAV_MODULES,
  normalizeNavModules,
} from './nav-modules'

export const THEME_COLOR_PRESETS = [
  '#00B96B',
  '#eb2f96',
  '#13c2c2',
  '#1677ff',
  '#722ed1',
  '#c41d7f',
  '#36cfc9',
  '#fa8c16',
  '#2f54eb',
  '#69c0ff',
  '#003a8c',
] as const

export interface AppSettings {
  language: AppLanguage
  restoreLastSession: boolean
  sendWithEnter: boolean
  webSearchEnabled: boolean
  webSearchProvider: 'duckduckgo' | 'bing' | 'google'
  kbEnabled: boolean
  memoryEnabled: boolean
  memoryRetentionDays: number
  documentOcrEnabled: boolean
  automationEnabled: boolean
  spellCheckEnabled: boolean
  anonymousErrorReports: boolean
  usageStatistics: boolean
  theme: AppTheme
  themeColor: string
  transparentWindow: boolean
  navBarPosition: NavBarPosition
  zoomLevel: number
  fontFamily: AppFontFamily
  sidebarVisibleModules: NavModuleId[]
  sidebarHiddenModules: NavModuleId[]
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'zh-CN',
  restoreLastSession: true,
  sendWithEnter: true,
  webSearchEnabled: false,
  webSearchProvider: 'duckduckgo',
  kbEnabled: true,
  memoryEnabled: true,
  memoryRetentionDays: 30,
  documentOcrEnabled: true,
  automationEnabled: false,
  spellCheckEnabled: true,
  anonymousErrorReports: true,
  usageStatistics: true,
  theme: 'light',
  themeColor: '#00B96B',
  transparentWindow: false,
  navBarPosition: 'left',
  zoomLevel: 100,
  fontFamily: 'system',
  sidebarVisibleModules: [...DEFAULT_VISIBLE_NAV_MODULES],
  sidebarHiddenModules: [...DEFAULT_HIDDEN_NAV_MODULES],
}

const STORAGE_KEY = 'toolman:app-settings'

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APP_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const normalized = normalizeNavModules(
      parsed.sidebarVisibleModules,
      parsed.sidebarHiddenModules,
    )
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      navBarPosition: parsed.navBarPosition === 'top' ? 'left' : (parsed.navBarPosition ?? 'left'),
      sidebarVisibleModules: normalized.visible,
      sidebarHiddenModules: normalized.hidden,
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function resetSidebarModules(): Pick<AppSettings, 'sidebarVisibleModules' | 'sidebarHiddenModules'> {
  return {
    sidebarVisibleModules: [...DEFAULT_VISIBLE_NAV_MODULES],
    sidebarHiddenModules: [...DEFAULT_HIDDEN_NAV_MODULES],
  }
}
