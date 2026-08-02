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

export function appThemeLabel(theme: AppTheme, t?: (key: string) => string): string {
  if (t) {
    switch (theme) {
      case 'light':
        return t('theme.light')
      case 'dark':
        return t('theme.dark')
      case 'system':
        return t('theme.system')
      default:
        return theme
    }
  }
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
import type { OdlHybridSettings, PdfParserBackend } from '@toolman/shared'
import { DEFAULT_ODL_HYBRID_SETTINGS, normalizeOdlHybridSettings } from '@toolman/shared'
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
  /** Legacy / fallback default when an assistant has no per-agent override. */
  kbEnabled: boolean
  /** Per-assistant knowledge-search toggle (independent open/closed states). */
  kbEnabledByAssistantId: Record<string, boolean>
  memoryEnabled: boolean
  memoryRetentionDays: number
  documentOcrEnabled: boolean
  pdfParserBackend: PdfParserBackend
  odlHybrid: OdlHybridSettings
  defaultChatModelId: string
  defaultEmbeddingModelRef: string
  defaultDocProcessorProviderId: string
  plannerModelId: string
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
  webSearchProvider: 'bing',
  kbEnabled: false,
  kbEnabledByAssistantId: {},
  memoryEnabled: true,
  memoryRetentionDays: 30,
  documentOcrEnabled: true,
  pdfParserBackend: 'opendataloader',
  odlHybrid: { ...DEFAULT_ODL_HYBRID_SETTINGS },
  defaultChatModelId: '',
  defaultEmbeddingModelRef: '',
  defaultDocProcessorProviderId: '',
  plannerModelId: '',
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

function normalizeKbEnabledByAssistantId(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {}
  const next: Record<string, boolean> = {}
  for (const [assistantId, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (!assistantId || typeof enabled !== 'boolean') continue
    next[assistantId] = enabled
  }
  return next
}

/** Resolve knowledge-search toggle for a specific assistant. */
export function resolveAssistantKbEnabled(
  settings: {
    kbEnabled?: boolean
    kbEnabledByAssistantId?: Record<string, boolean> | null
  },
  assistantId: string | null | undefined,
): boolean {
  if (!assistantId) return Boolean(settings.kbEnabled)
  const mapped = settings.kbEnabledByAssistantId?.[assistantId]
  if (typeof mapped === 'boolean') return mapped
  return Boolean(settings.kbEnabled)
}

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
      language: parsed.language === 'en' ? 'en' : 'zh-CN',
      defaultChatModelId: parsed.defaultChatModelId ?? '',
      defaultEmbeddingModelRef: parsed.defaultEmbeddingModelRef ?? '',
      defaultDocProcessorProviderId: parsed.defaultDocProcessorProviderId ?? '',
      pdfParserBackend:
        parsed.pdfParserBackend === 'opendataloader' ? 'opendataloader' : 'builtin',
      odlHybrid: normalizeOdlHybridSettings(parsed.odlHybrid),
      navBarPosition: parsed.navBarPosition === 'top' ? 'left' : (parsed.navBarPosition ?? 'left'),
      kbEnabledByAssistantId: normalizeKbEnabledByAssistantId(parsed.kbEnabledByAssistantId),
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
