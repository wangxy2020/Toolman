import { hostnameOfBaseUrl, isOfficialCommunityHubHost, resolveCuratedEdgeTtsVoice } from '@toolman/shared'
import { isAppLanguage } from '../i18n/language'
import { TOP_NAV_MODULE_IDS, type TopNavModuleId } from '../module-ids'
import { normalizeNavModules } from './nav-visibility'
import { DEFAULT_MODULE_PREFS, type ModulePrefs } from './prefs-defaults'

function localOnlyCommunityHubUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return isOfficialCommunityHubHost(hostnameOfBaseUrl(trimmed)) ? '' : trimmed
}

/** Module settings pages were removed; keep those prefs at program defaults. */
export function removedModuleSettingsNeedReset(parsed: Partial<ModulePrefs>): boolean {
  const group = { ...DEFAULT_MODULE_PREFS.group, ...parsed.group }
  const projects = { ...DEFAULT_MODULE_PREFS.projects, ...parsed.projects }
  return (
    JSON.stringify(group) !== JSON.stringify(DEFAULT_MODULE_PREFS.group) ||
    JSON.stringify(projects) !== JSON.stringify(DEFAULT_MODULE_PREFS.projects) ||
    parsed.classroom?.preferDesktopHost === true
  )
}

export function normalizeLoadedModulePrefs(parsed: Partial<ModulePrefs>): ModulePrefs {
  const agent = { ...DEFAULT_MODULE_PREFS.agent, ...parsed.agent }
  agent.ttsEngine = agent.ttsEngine === 'web-speech' ? 'web-speech' : 'edge'
  agent.ttsVoice = resolveCuratedEdgeTtsVoice(agent.ttsVoice)
  agent.autoSpeak = agent.autoSpeak !== false
  agent.name = agent.name?.trim() || DEFAULT_MODULE_PREFS.agent.name
  agent.description = typeof agent.description === 'string' ? agent.description : DEFAULT_MODULE_PREFS.agent.description
  agent.systemPrompt =
    typeof agent.systemPrompt === 'string' ? agent.systemPrompt : DEFAULT_MODULE_PREFS.agent.systemPrompt
  agent.permissionMode = ['normal', 'plan', 'auto-edit', 'full-auto'].includes(agent.permissionMode)
    ? agent.permissionMode
    : 'normal'
  agent.heartbeatEnabled = Boolean(agent.heartbeatEnabled)
  agent.heartbeatIntervalMinutes =
    Number(agent.heartbeatIntervalMinutes) > 0
      ? Number(agent.heartbeatIntervalMinutes)
      : DEFAULT_MODULE_PREFS.agent.heartbeatIntervalMinutes
  agent.temperature =
    typeof agent.temperature === 'number' && Number.isFinite(agent.temperature)
      ? Math.min(2, Math.max(0, agent.temperature))
      : DEFAULT_MODULE_PREFS.agent.temperature
  agent.maxTokens = typeof agent.maxTokens === 'string' ? agent.maxTokens : ''
  agent.sessionRoundLimit =
    Number(agent.sessionRoundLimit) > 0
      ? Number(agent.sessionRoundLimit)
      : DEFAULT_MODULE_PREFS.agent.sessionRoundLimit
  agent.environmentVariables =
    typeof agent.environmentVariables === 'string' ? agent.environmentVariables : ''
  agent.mcpServerIds = Array.isArray(agent.mcpServerIds)
    ? agent.mcpServerIds.filter((id): id is string => typeof id === 'string')
    : [...DEFAULT_MODULE_PREFS.agent.mcpServerIds]
  agent.skillIds = Array.isArray(agent.skillIds)
    ? agent.skillIds.filter((id): id is string => typeof id === 'string')
    : [...DEFAULT_MODULE_PREFS.agent.skillIds]
  agent.kbIds = Array.isArray(agent.kbIds)
    ? agent.kbIds.filter((id): id is string => typeof id === 'string')
    : []
  agent.bashEnabled = Boolean(agent.bashEnabled)
  agent.translationLanguages =
    Array.isArray(agent.translationLanguages) &&
    agent.translationLanguages.length === 2 &&
    agent.translationLanguages.every((item) => item === 'zh' || item === 'en')
      ? (agent.translationLanguages as [string, string])
      : [...DEFAULT_MODULE_PREFS.agent.translationLanguages]
  const classroomSyncEnabled =
    typeof parsed.classroom?.syncEnabled === 'boolean'
      ? parsed.classroom.syncEnabled
      : DEFAULT_MODULE_PREFS.classroom.syncEnabled
  return {
    agent,
    knowledge: {
      syncEnabled: parsed.knowledge?.syncEnabled !== false,
      preferDesktopIndex: parsed.knowledge?.preferDesktopIndex !== false,
    },
    notes: {
      syncEnabled: parsed.notes?.syncEnabled !== false,
      autoSyncOnEdit: parsed.notes?.autoSyncOnEdit !== false,
      openMode:
        parsed.notes?.openMode === 'live-preview' || parsed.notes?.openMode === 'preview-only'
          ? parsed.notes.openMode
          : 'edit-only',
      showOutline: parsed.notes?.showOutline !== false,
      narrowColumn: Boolean(parsed.notes?.narrowColumn),
      fontSize:
        Number(parsed.notes?.fontSize) >= 10 && Number(parsed.notes?.fontSize) <= 30
          ? Math.round(Number(parsed.notes?.fontSize))
          : DEFAULT_MODULE_PREFS.notes.fontSize,
    },
    translate: { ...DEFAULT_MODULE_PREFS.translate, ...parsed.translate },
    group: { ...DEFAULT_MODULE_PREFS.group },
    community: {
      hubBaseUrl: localOnlyCommunityHubUrl(parsed.community?.hubBaseUrl),
      guestReadOnly: parsed.community?.guestReadOnly !== false,
    },
    classroom: {
      ...DEFAULT_MODULE_PREFS.classroom,
      syncEnabled: classroomSyncEnabled,
    },
    projects: { ...DEFAULT_MODULE_PREFS.projects },
    sync: {
      hubBaseUrl:
        typeof parsed.sync?.hubBaseUrl === 'string' ? parsed.sync.hubBaseUrl : '',
      hubToken: typeof parsed.sync?.hubToken === 'string' ? parsed.sync.hubToken : '',
    },
    app: {
      ...DEFAULT_MODULE_PREFS.app,
      ...parsed.app,
      language: isAppLanguage(parsed.app?.language)
        ? parsed.app.language
        : DEFAULT_MODULE_PREFS.app.language,
      restoreLastSession: parsed.app?.restoreLastSession !== false,
      lastModule:
        parsed.app?.lastModule && TOP_NAV_MODULE_IDS.includes(parsed.app.lastModule as TopNavModuleId)
          ? (parsed.app.lastModule as TopNavModuleId)
          : 'agent',
      memoryEnabled: parsed.app?.memoryEnabled !== false,
      memoryRetentionDays:
        Number(parsed.app?.memoryRetentionDays) > 0
          ? Math.min(365, Number(parsed.app?.memoryRetentionDays))
          : DEFAULT_MODULE_PREFS.app.memoryRetentionDays,
      analyticsOptIn: Boolean(parsed.app?.analyticsOptIn),
    },
    nav: normalizeNavModules(parsed.nav?.visibleModuleIds, parsed.nav?.hiddenModuleIds),
  }
}
