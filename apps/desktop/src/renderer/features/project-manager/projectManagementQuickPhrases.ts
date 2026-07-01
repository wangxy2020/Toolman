import { EPC_BUILTIN_QUICK_PHRASES } from '@toolman/shared'
import { loadQuickPhrases, type QuickPhrase } from '../chat/quick-phrases'

const BUILTIN_REVISION_KEY = 'toolman:epc-builtin-quick-phrases-revision'

function readStoredRevision(): number {
  try {
    const raw = localStorage.getItem(BUILTIN_REVISION_KEY)
    return raw ? Number.parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

function writeStoredRevision(revision: number): void {
  localStorage.setItem(BUILTIN_REVISION_KEY, String(revision))
}

export function mergeEpcBuiltinQuickPhrases(userPhrases: QuickPhrase[]): QuickPhrase[] {
  const maxRevision = Math.max(...EPC_BUILTIN_QUICK_PHRASES.map((item) => item.revision), 0)
  const storedRevision = readStoredRevision()
  const shouldSyncContent = storedRevision < maxRevision

  const userById = new Map(userPhrases.map((phrase) => [phrase.id, phrase]))
  const builtins: QuickPhrase[] = EPC_BUILTIN_QUICK_PHRASES.map((item) => {
    const existing = userById.get(item.id)
    if (existing && !shouldSyncContent && !existing.builtin) {
      return existing
    }
    return {
      id: item.id,
      label: item.label,
      text: item.text,
      builtin: true,
      builtinRevision: item.revision,
    }
  })

  const builtinIds = new Set(builtins.map((item) => item.id))
  const remainingUser = userPhrases.filter((phrase) => !builtinIds.has(phrase.id))

  if (shouldSyncContent) {
    writeStoredRevision(maxRevision)
  }

  return [...builtins, ...remainingUser]
}

export function loadProjectManagementQuickPhrases(): QuickPhrase[] {
  return mergeEpcBuiltinQuickPhrases(loadQuickPhrases())
}
