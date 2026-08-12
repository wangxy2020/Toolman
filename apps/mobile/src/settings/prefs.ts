import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  DEFAULT_EDGE_TTS_VOICE,
  resolveCuratedEdgeTtsVoice,
  type VoiceTtsEngine,
} from '@toolman/shared'

const PREFS_KEY = 'toolman.mobile.modulePrefs'

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
  }
  knowledge: {
    syncEnabled: boolean
    preferDesktopIndex: boolean
  }
  notes: {
    syncEnabled: boolean
    autoSyncOnEdit: boolean
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
  }
  projects: {
    preferDesktopHost: boolean
  }
}

export const DEFAULT_MODULE_PREFS: ModulePrefs = {
  agent: {
    preferDesktopHost: false,
    defaultWebSearch: false,
    defaultKb: false,
    ttsEngine: 'edge',
    ttsVoice: DEFAULT_EDGE_TTS_VOICE,
    autoSpeak: true,
  },
  knowledge: {
    syncEnabled: true,
    preferDesktopIndex: true,
  },
  notes: {
    syncEnabled: true,
    autoSyncOnEdit: true,
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
  },
  projects: {
    preferDesktopHost: false,
  },
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
    return {
      agent,
      knowledge: { ...DEFAULT_MODULE_PREFS.knowledge, ...parsed.knowledge },
      notes: { ...DEFAULT_MODULE_PREFS.notes, ...parsed.notes },
      translate: { ...DEFAULT_MODULE_PREFS.translate, ...parsed.translate },
      group: { ...DEFAULT_MODULE_PREFS.group, ...parsed.group },
      community: { ...DEFAULT_MODULE_PREFS.community, ...parsed.community },
      classroom: { ...DEFAULT_MODULE_PREFS.classroom, ...parsed.classroom },
      projects: { ...DEFAULT_MODULE_PREFS.projects, ...parsed.projects },
    }
  } catch {
    return DEFAULT_MODULE_PREFS
  }
}

export async function saveModulePrefs(prefs: ModulePrefs): Promise<void> {
  await setItem(PREFS_KEY, JSON.stringify(prefs))
}
