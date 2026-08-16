import {
  DEFAULT_EDGE_TTS_VOICE,
  getDefaultMcpServerIds,
  getDefaultSkillIds,
  type VoiceTtsEngine,
} from '@toolman/shared'
import type { AppLanguage } from '../i18n/language'
import type { TopNavModuleId } from '../module-ids'
import { normalizeNavModules, type NavModulePrefs } from './nav-visibility'

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
    /** Pairing token from desktop Diagnostics. */
    hubToken: string
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
    hubToken: '',
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
