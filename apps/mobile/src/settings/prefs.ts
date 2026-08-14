import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  DEFAULT_EDGE_TTS_VOICE,
  getDefaultMcpServerIds,
  getDefaultSkillIds,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '@toolman/shared'
import { isAppLanguage, type AppLanguage } from '../i18n/language'
import { TOP_NAV_MODULE_IDS, type TopNavModuleId } from '../module-ids'
import { normalizeNavModules, type NavModulePrefs } from './nav-visibility'

const PREFS_KEY = 'toolman.mobile.modulePrefs'

export type AgentPermissionMode = 'normal' | 'plan' | 'auto-edit' | 'full-auto'

export type NotesOpenMode = 'edit-only' | 'live-preview' | 'preview-only'

export type ModulePrefs = {
  agent: {
    preferDesktopHost: boolean
    defaultWebSearch: boolean
    defaultKb: boolean
    /** Align with desktop assistant TTS defaults. */
    ttsEngine: VoiceTtsEngine
    ttsVoice: string
    /** When true, speak assistant replies after generation finishes. Default on. */
    autoSpeak: boolean
    name: string
    description: string
    systemPrompt: string
    permissionMode: AgentPermissionMode
    heartbeatEnabled: boolean
    heartbeatIntervalMinutes: number
    temperature: number
    maxTokens: string
    sessionRoundLimit: number
    environmentVariables: string
    mcpServerIds: string[]
    skillIds: string[]
    kbIds: string[]
    bashEnabled: boolean
    translationLanguages: [string, string]
  }
  knowledge: {
    syncEnabled: boolean
    preferDesktopIndex: boolean
  }
  notes: {
    syncEnabled: boolean
    autoSyncOnEdit: boolean
    openMode: NotesOpenMode
    showOutline: boolean
    narrowColumn: boolean
    fontSize: number
  }
  translate: {
    targetLang: string
    preferDesktopPipeline: boolean
  }
  group: {
    preferDesktopHost: boolean
  }
  community: {
    hubBaseUrl: string
    guestReadOnly: boolean
  }
  classroom: {
    preferDesktopHost: boolean
    /** Receive desktop classroom courses, teaching mode, syllabus, and study records. */
    syncEnabled: boolean
  }
  projects: {
    preferDesktopHost: boolean
  }
  /** Desktop Sync Hub (`:17890`) — not Community Hub. */
  sync: {
    hubBaseUrl: string
  }
  app: {
    language: AppLanguage
    restoreLastSession: boolean
    lastModule: TopNavModuleId
    memoryEnabled: boolean
    memoryRetentionDays: number
    analyticsOptIn: boolean
  }
  nav: NavModulePrefs
}

export const DEFAULT_MODULE_PREFS: ModulePrefs = {
  agent: {
    preferDesktopHost: false,
    defaultWebSearch: false,
    defaultKb: false,
    ttsEngine: 'edge',
    ttsVoice: DEFAULT_EDGE_TTS_VOICE,
    autoSpeak: true,
    name: '智能体',
    description: '默认 AI 对话智能体',
    systemPrompt: '你是一个有帮助的 AI 助手。',
    permissionMode: 'normal',
    heartbeatEnabled: false,
    heartbeatIntervalMinutes: 30,
    temperature: 0.7,
    maxTokens: '',
    sessionRoundLimit: 100,
    environmentVariables: '',
    mcpServerIds: getDefaultMcpServerIds(),
    skillIds: getDefaultSkillIds(),
    kbIds: [],
    bashEnabled: false,
    translationLanguages: ['zh', 'en'],
  },
  knowledge: {
    syncEnabled: true,
    preferDesktopIndex: true,
  },
  notes: {
    syncEnabled: true,
    autoSyncOnEdit: true,
    openMode: 'edit-only',
    showOutline: true,
    narrowColumn: false,
    fontSize: 16,
  },
  translate: {
    targetLang: 'zh-CN',
    preferDesktopPipeline: true,
  },
  group: {
    preferDesktopHost: false,
  },
  community: {
    hubBaseUrl: '',
    guestReadOnly: true,
  },
  classroom: {
    preferDesktopHost: false,
    syncEnabled: true,
  },
  projects: {
    preferDesktopHost: false,
  },
  sync: {
    hubBaseUrl: '',
  },
  app: {
    language: 'zh-CN',
    restoreLastSession: true,
    lastModule: 'agent',
    memoryEnabled: true,
    memoryRetentionDays: 30,
    analyticsOptIn: false,
  },
  nav: normalizeNavModules(),
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function loadModulePrefs(): Promise<ModulePrefs> {
  try {
    const raw = await getItem(PREFS_KEY)
    if (!raw) return DEFAULT_MODULE_PREFS
    const parsed = JSON.parse(raw) as Partial<ModulePrefs>
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
    const next: ModulePrefs = {
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
        hubBaseUrl:
          typeof parsed.community?.hubBaseUrl === 'string' ? parsed.community.hubBaseUrl : '',
        guestReadOnly: parsed.community?.guestReadOnly !== false,
      },
      classroom: {
        ...DEFAULT_MODULE_PREFS.classroom,
        syncEnabled: classroomSyncEnabled,
      },
      projects: { ...DEFAULT_MODULE_PREFS.projects },
      sync: { ...DEFAULT_MODULE_PREFS.sync, ...parsed.sync },
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
    if (removedModuleSettingsNeedReset(parsed)) {
      await setItem(PREFS_KEY, JSON.stringify(next))
    }
    return next
  } catch {
    return DEFAULT_MODULE_PREFS
  }
}

export async function saveModulePrefs(prefs: ModulePrefs): Promise<void> {
  await setItem(PREFS_KEY, JSON.stringify(prefs))
}

/** Module settings pages were removed; keep those prefs at program defaults. */
function removedModuleSettingsNeedReset(parsed: Partial<ModulePrefs>): boolean {
  const group = { ...DEFAULT_MODULE_PREFS.group, ...parsed.group }
  const projects = { ...DEFAULT_MODULE_PREFS.projects, ...parsed.projects }
  return (
    JSON.stringify(group) !== JSON.stringify(DEFAULT_MODULE_PREFS.group) ||
    JSON.stringify(projects) !== JSON.stringify(DEFAULT_MODULE_PREFS.projects) ||
    parsed.classroom?.preferDesktopHost === true
  )
}
