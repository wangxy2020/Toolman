import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'

export type { MobileClassroomCourse }

const KEY = 'toolman.mobile.classroomCourses.v1'

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

export async function loadClassroomCourses(): Promise<MobileClassroomCourse[]> {
  try {
    const raw = await getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { courses?: MobileClassroomCourse[] }
    return Array.isArray(parsed.courses) ? parsed.courses : []
  } catch {
    return []
  }
}

export async function saveClassroomCourses(courses: MobileClassroomCourse[]): Promise<void> {
  await setItem(KEY, JSON.stringify({ courses }))
}
