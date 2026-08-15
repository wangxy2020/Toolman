import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const STATE_KEY = 'toolman.mobile.sync-state'

export type MobileSyncState = {
  cursor: string | null
  noteStamps: Record<string, number>
  deletedStamps: Record<string, number>
  classroomStamps: Record<string, number>
  knowledgeSince: number
}

export const EMPTY_MOBILE_SYNC_STATE: MobileSyncState = {
  cursor: null,
  noteStamps: {},
  deletedStamps: {},
  classroomStamps: {},
  knowledgeSince: 0,
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

export async function loadMobileSyncState(): Promise<MobileSyncState> {
  try {
    const raw = await getItem(STATE_KEY)
    if (!raw) return { ...EMPTY_MOBILE_SYNC_STATE }
    const parsed = JSON.parse(raw) as Partial<MobileSyncState>
    return {
      cursor: typeof parsed.cursor === 'string' ? parsed.cursor : null,
      noteStamps:
        parsed.noteStamps && typeof parsed.noteStamps === 'object' ? parsed.noteStamps : {},
      deletedStamps:
        parsed.deletedStamps && typeof parsed.deletedStamps === 'object'
          ? parsed.deletedStamps
          : {},
      classroomStamps:
        parsed.classroomStamps && typeof parsed.classroomStamps === 'object'
          ? parsed.classroomStamps
          : {},
      knowledgeSince:
        typeof parsed.knowledgeSince === 'number' && Number.isFinite(parsed.knowledgeSince)
          ? parsed.knowledgeSince
          : 0,
    }
  } catch {
    return { ...EMPTY_MOBILE_SYNC_STATE }
  }
}

export async function saveMobileSyncState(state: MobileSyncState): Promise<void> {
  await setItem(STATE_KEY, JSON.stringify(state))
}
