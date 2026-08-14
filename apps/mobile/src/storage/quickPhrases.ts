import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const STORE_KEY = 'toolman.mobile.quickPhrases.v1'

export type QuickPhrase = {
  id: string
  label: string
  text: string
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

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitize(list: unknown): QuickPhrase[] {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Partial<QuickPhrase>
      const text = typeof row.text === 'string' ? row.text.trim() : ''
      if (!text) return null
      const id = typeof row.id === 'string' && row.id ? row.id : createId()
      const label =
        typeof row.label === 'string' && row.label.trim() ? row.label.trim() : text.slice(0, 24)
      return { id, label, text }
    })
    .filter((item): item is QuickPhrase => Boolean(item))
}

export async function loadQuickPhrases(): Promise<QuickPhrase[]> {
  try {
    const raw = await getItem(STORE_KEY)
    if (!raw) return []
    return sanitize(JSON.parse(raw))
  } catch {
    return []
  }
}

async function saveQuickPhrases(phrases: QuickPhrase[]): Promise<void> {
  await setItem(STORE_KEY, JSON.stringify(phrases))
}

export async function addQuickPhrase(text: string, label?: string): Promise<QuickPhrase[]> {
  const trimmed = text.trim()
  if (!trimmed) return loadQuickPhrases()
  const next: QuickPhrase = {
    id: createId(),
    label: label?.trim() || trimmed.slice(0, 24),
    text: trimmed,
  }
  const phrases = [next, ...(await loadQuickPhrases())]
  await saveQuickPhrases(phrases)
  return phrases
}

export async function removeQuickPhrase(id: string): Promise<QuickPhrase[]> {
  const phrases = (await loadQuickPhrases()).filter((item) => item.id !== id)
  await saveQuickPhrases(phrases)
  return phrases
}

export async function updateQuickPhrase(
  id: string,
  patch: { label?: string; text?: string },
): Promise<QuickPhrase[]> {
  const phrases = (await loadQuickPhrases())
    .map((item) => {
      if (item.id !== id) return item
      const text = patch.text !== undefined ? patch.text.trim() : item.text
      const label =
        patch.label !== undefined ? patch.label.trim() || text.slice(0, 24) : item.label
      return { ...item, label, text }
    })
    .filter((item) => item.text.trim())
  await saveQuickPhrases(phrases)
  return phrases
}
