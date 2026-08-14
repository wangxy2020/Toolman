export type SystemSectionId =
  | 'general'
  | 'display'
  | 'memory'
  | 'quick-phrases'
  | 'diagnostics'
  | 'about'

export type SettingsTabId = 'user' | 'agent' | SystemSectionId

export const SETTINGS_TABS: Array<{
  id: Exclude<SettingsTabId, SystemSectionId>
  labelKey: string
}> = [
  { id: 'user', labelKey: 'settings.user' },
  { id: 'agent', labelKey: 'settings.modelService' },
]

/** Desktop settings nav, trimmed for mobile (no window chrome, MCP/skills, shortcuts, etc.). */
export const SYSTEM_SETTINGS_SECTIONS: Array<{
  id: SystemSectionId
  labelKey: string
}> = [
  { id: 'general', labelKey: 'settings.general' },
  { id: 'display', labelKey: 'settings.display' },
  { id: 'memory', labelKey: 'settings.memory' },
  { id: 'quick-phrases', labelKey: 'settings.quickPhrases' },
  { id: 'diagnostics', labelKey: 'settings.diagnostics' },
  { id: 'about', labelKey: 'settings.about' },
]

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'user'
export const DEFAULT_SYSTEM_SECTION: SystemSectionId = 'general'

const SYSTEM_SECTION_IDS = new Set<string>(SYSTEM_SETTINGS_SECTIONS.map((item) => item.id))

export function isSystemSection(id: SettingsTabId): id is SystemSectionId {
  return SYSTEM_SECTION_IDS.has(id)
}
