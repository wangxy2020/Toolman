/** Gantt UI preferences localStorage load / save. */

import { DEFAULT_GANTT_TASK_COLORS, DEFAULT_GANTT_VISIBLE_COLUMNS } from './pm-gantt-prefs-types'
import { DEFAULT_GANTT_UI_PREFS, type GanttUiPrefs } from './pm-gantt-prefs-ui'
import { normalizeGanttUiPrefs } from './pm-gantt-prefs-normalize'

const GANTT_UI_PREFS_KEY = 'tm-pm-gantt-ui-prefs'
const LEGACY_LABELS_KEY = 'tm-pm-gantt-column-labels'

export function loadGanttUiPrefs(): GanttUiPrefs {
  try {
    const raw = localStorage.getItem(GANTT_UI_PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GanttUiPrefs>
      const normalized = normalizeGanttUiPrefs(parsed)
      // Persist migrations (e.g. drop legacy「完成百分比」custom column).
      try {
        localStorage.setItem(GANTT_UI_PREFS_KEY, JSON.stringify(normalized))
      } catch {
        // ignore quota
      }
      return normalized
    }
    // Migrate legacy label-only storage
    const legacy = localStorage.getItem(LEGACY_LABELS_KEY)
    if (legacy) {
      const labels = JSON.parse(legacy) as Record<string, string>
      return normalizeGanttUiPrefs({ columnLabels: labels })
    }
  } catch {
    // ignore
  }
  return {
    ...DEFAULT_GANTT_UI_PREFS,
    columnOrder: [...DEFAULT_GANTT_VISIBLE_COLUMNS],
    taskColors: { ...DEFAULT_GANTT_TASK_COLORS },
  }
}

export function saveGanttUiPrefs(prefs: GanttUiPrefs): void {
  try {
    localStorage.setItem(GANTT_UI_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('tm-pm-gantt-prefs'))
  }
}
