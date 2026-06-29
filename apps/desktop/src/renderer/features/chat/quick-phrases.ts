export interface QuickPhrase {
  id: string
  label: string
  text: string
}

const STORAGE_KEY = 'toolman:quick-phrases'

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadQuickPhrases(): QuickPhrase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QuickPhrase[]
    return Array.isArray(parsed) ? parsed.filter((item) => item.text?.trim()) : []
  } catch {
    return []
  }
}

function saveQuickPhrases(phrases: QuickPhrase[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases))
}

export function addQuickPhrase(text: string, label?: string): QuickPhrase[] {
  const trimmed = text.trim()
  if (!trimmed) return loadQuickPhrases()

  const next: QuickPhrase = {
    id: createId(),
    label: label?.trim() || trimmed.slice(0, 24),
    text: trimmed,
  }
  const phrases = [next, ...loadQuickPhrases()]
  saveQuickPhrases(phrases)
  return phrases
}

export function removeQuickPhrase(id: string): QuickPhrase[] {
  const phrases = loadQuickPhrases().filter((item) => item.id !== id)
  saveQuickPhrases(phrases)
  return phrases
}

export function updateQuickPhrase(
  id: string,
  patch: { label?: string; text?: string },
): QuickPhrase[] {
  const phrases = loadQuickPhrases()
    .map((item) => {
      if (item.id !== id) return item
      const text = patch.text !== undefined ? patch.text.trim() : item.text
      const label =
        patch.label !== undefined
          ? patch.label.trim() || text.slice(0, 24)
          : item.label
      return { ...item, label, text }
    })
    .filter((item) => item.text.trim())

  saveQuickPhrases(phrases)
  return phrases
}
