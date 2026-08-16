import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  DEFAULT_MODULE_PREFS,
  type AgentPermissionMode,
  type ModulePrefs,
  type NotesOpenMode,
} from './prefs-defaults'
import { normalizeLoadedModulePrefs, removedModuleSettingsNeedReset } from './prefs-normalize'

export type { AgentPermissionMode, ModulePrefs, NotesOpenMode }
export { DEFAULT_MODULE_PREFS }

const PREFS_KEY = 'toolman.mobile.modulePrefs'

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
    const next = normalizeLoadedModulePrefs(parsed)
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
