import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'
import { loadOwnedScoped, saveOwnedScoped } from './identityScope'
import { ensureMobileGuideClassroomCourses } from '../features/guideClassroomEnsure'

export type { MobileClassroomCourse }

const KEY = 'toolman.mobile.classroomCourses.v1'
const DISMISS_KEY = 'toolman.mobile.classroomGuideDismissed.v1'

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

export async function loadClassroomGuideDismissed(): Promise<boolean> {
  try {
    const parsed = await loadOwnedScoped<{ dismissed?: boolean }>(DISMISS_KEY, getItem)
    return parsed?.dismissed === true
  } catch {
    return false
  }
}

export async function saveClassroomGuideDismissed(dismissed: boolean): Promise<void> {
  await saveOwnedScoped(DISMISS_KEY, { dismissed }, setItem)
}

export async function loadClassroomCourses(): Promise<MobileClassroomCourse[]> {
  try {
    const [parsed, dismissed] = await Promise.all([
      loadOwnedScoped<{ courses?: MobileClassroomCourse[] }>(KEY, getItem),
      loadClassroomGuideDismissed(),
    ])
    const courses = Array.isArray(parsed?.courses) ? parsed.courses : []
    return ensureMobileGuideClassroomCourses(courses, dismissed)
  } catch {
    return ensureMobileGuideClassroomCourses([], false)
  }
}

export async function saveClassroomCourses(courses: MobileClassroomCourse[]): Promise<void> {
  await saveOwnedScoped(KEY, { courses }, setItem)
}
