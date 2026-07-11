import {
  COST_FORECAST_QUICK_PHRASE_CONTENT,
  COST_FORECAST_QUICK_PHRASE_ID,
  PLAN_SCHEDULE_QUICK_PHRASE_CONTENT,
  PLAN_BUILTIN_QUICK_PHRASES,
  PLAN_WBS_QUICK_PHRASE_CONTENT,
  PLAN_WBS_QUICK_PHRASE_ID,
  PLAN_SCHEDULE_QUICK_PHRASE_ID,
  REPORT_DAILY_QUICK_PHRASE_CONTENT,
  REPORT_DAILY_QUICK_PHRASE_ID,
  REPORT_MONTHLY_QUICK_PHRASE_CONTENT,
  REPORT_MONTHLY_QUICK_PHRASE_ID,
  REPORT_WEEKLY_QUICK_PHRASE_CONTENT,
  REPORT_WEEKLY_QUICK_PHRASE_ID,
} from '@toolman/shared'
import { loadQuickPhrases, type QuickPhrase } from '../chat/quick-phrases'
import { mergeEpcBuiltinQuickPhrases } from './projectManagementQuickPhrases'

const PLAN_BUILTIN_REVISION_KEY = 'toolman:pm-plan-builtin-quick-phrases-revision'

function readStoredRevision(): number {
  try {
    const raw = localStorage.getItem(PLAN_BUILTIN_REVISION_KEY)
    return raw ? Number.parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

function writeStoredRevision(revision: number): void {
  localStorage.setItem(PLAN_BUILTIN_REVISION_KEY, String(revision))
}

function mergePlanBuiltinQuickPhrases(userPhrases: QuickPhrase[]): QuickPhrase[] {
  const maxRevision = Math.max(...PLAN_BUILTIN_QUICK_PHRASES.map((item) => item.revision), 0)
  const storedRevision = readStoredRevision()
  const shouldSyncContent = storedRevision < maxRevision
  const userById = new Map(userPhrases.map((phrase) => [phrase.id, phrase]))

  const builtins: QuickPhrase[] = PLAN_BUILTIN_QUICK_PHRASES.map((item) => {
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

export function loadPlanManagementQuickPhrases(): QuickPhrase[] {
  const merged = mergePlanBuiltinQuickPhrases(loadQuickPhrases())
  return merged.filter(
    (phrase) => phrase.id === PLAN_WBS_QUICK_PHRASE_ID || phrase.id === PLAN_SCHEDULE_QUICK_PHRASE_ID,
  )
}

export function loadCostManagementQuickPhrases(): QuickPhrase[] {
  const withEpc = mergeEpcBuiltinQuickPhrases(loadQuickPhrases())
  const forecast = mergePlanBuiltinQuickPhrases(loadQuickPhrases()).find(
    (phrase) => phrase.id === COST_FORECAST_QUICK_PHRASE_ID,
  )
  return forecast ? [forecast, ...withEpc.filter((p) => p.id !== COST_FORECAST_QUICK_PHRASE_ID)] : withEpc
}

export function loadExecutionReportQuickPhrases(): QuickPhrase[] {
  const merged = mergePlanBuiltinQuickPhrases(loadQuickPhrases())
  return merged.filter(
    (phrase) =>
      phrase.id === REPORT_DAILY_QUICK_PHRASE_ID ||
      phrase.id === REPORT_WEEKLY_QUICK_PHRASE_ID ||
      phrase.id === REPORT_MONTHLY_QUICK_PHRASE_ID,
  )
}

export function resolvePlanSlashCommand(command: string): string | null {
  switch (command.trim().toLowerCase()) {
    case '/wbs':
      return PLAN_WBS_QUICK_PHRASE_CONTENT
    case '/schedule':
      return PLAN_SCHEDULE_QUICK_PHRASE_CONTENT
    case '/forecast':
      return COST_FORECAST_QUICK_PHRASE_CONTENT
    case '/daily':
      return REPORT_DAILY_QUICK_PHRASE_CONTENT
    case '/weekly':
      return REPORT_WEEKLY_QUICK_PHRASE_CONTENT
    case '/monthly':
      return REPORT_MONTHLY_QUICK_PHRASE_CONTENT
    default:
      return null
  }
}
