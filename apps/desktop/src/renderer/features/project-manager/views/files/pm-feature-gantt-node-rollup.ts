/** Live 节点 rows and milestone rollups from the Gantt schedule. */

import type { PmWorkItem } from '@toolman/shared'

import { durationDaysBetween } from '../schedule/pm-gantt-schedule'
import type { PmFeatureRow } from './pm-features-catalog'
import { startOfLocalDay } from './pm-feature-gantt-monthly'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const LIVE_NODE_ID_PREFIX = 'gantt-node:'

export function liveNodeFeatureId(workItemId: string): string {
  return `${LIVE_NODE_ID_PREFIX}${workItemId}`
}

export function parseLiveNodeWorkItemId(featureId: string): string | null {
  if (!featureId.startsWith(LIVE_NODE_ID_PREFIX)) return null
  const id = featureId.slice(LIVE_NODE_ID_PREFIX.length)
  return id.length > 0 ? id : null
}

export type GanttNodeSeed = {
  workItemId: string
  name: string
  startDate: number | null
  finishDate: number | null
  durationDays: number
  sortOrder: number
}

export type FeatureNodeRollup = {
  durationDays: number
  startDate: number | null
  finishDate: number | null
  /** Planned overall progress % at this milestone (along the project schedule). */
  plannedPercent: number | null
}

/** Distinct milestone tasks from the Gantt schedule (ordered by sortOrder / name). */
export function collectGanttNodeSeeds(items: readonly PmWorkItem[]): GanttNodeSeed[] {
  const seeds: GanttNodeSeed[] = []
  for (const item of items) {
    if (item.type !== 'milestone') continue
    const name = (item.title ?? '').trim() || item.id
    const startDate =
      item.startDate != null && Number.isFinite(item.startDate) ? item.startDate : null
    const finishDate =
      item.dueDate != null && Number.isFinite(item.dueDate) ? item.dueDate : startDate
    seeds.push({
      workItemId: item.id,
      name,
      startDate,
      finishDate,
      durationDays: 0,
      sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : 0,
    })
  }
  return seeds.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.name.localeCompare(right.name, 'zh')
  })
}

/** Planned progress % when the schedule reaches `asOfMs` within [rangeStart, rangeFinish]. */
export function plannedPercentAlongSchedule(
  asOfMs: number | null,
  rangeStart: number | null,
  rangeFinish: number | null,
): number | null {
  if (asOfMs == null || rangeStart == null || rangeFinish == null) return null
  const status = startOfLocalDay(asOfMs)
  const start = startOfLocalDay(rangeStart)
  const finish = startOfLocalDay(rangeFinish)
  if (finish <= start) return status >= finish ? 100 : 0
  if (status <= start) return 0
  if (status >= finish) return 100
  const span = Math.max(finish - start, MS_PER_DAY)
  return Math.min(100, Math.max(0, Math.round(((status - start) / span) * 100)))
}

function dateEnvelopeFromBounds(
  starts: readonly (number | null | undefined)[],
  finishes: readonly (number | null | undefined)[],
): { startDate: number | null; finishDate: number | null } {
  let startDate: number | null = null
  let finishDate: number | null = null
  for (const value of starts) {
    if (value != null && Number.isFinite(value)) {
      startDate = startDate == null ? value : Math.min(startDate, value)
    }
  }
  for (const value of finishes) {
    if (value != null && Number.isFinite(value)) {
      finishDate = finishDate == null ? value : Math.max(finishDate, value)
    }
  }
  if (startDate == null && finishDate != null) startDate = finishDate
  if (finishDate == null && startDate != null) finishDate = startDate
  return { startDate, finishDate }
}

function scheduleDateEnvelope(items: readonly PmWorkItem[]): {
  startDate: number | null
  finishDate: number | null
} {
  return dateEnvelopeFromBounds(
    items.map((item) => item.startDate),
    items.map((item) => item.dueDate),
  )
}

/** Project row: same schedule envelope / duration as the Gantt project root. */
function projectNodeEnvelope(scheduleRange: {
  startDate: number | null
  finishDate: number | null
}): FeatureNodeRollup {
  const { startDate, finishDate } = scheduleRange
  const durationDays =
    startDate != null && finishDate != null ? durationDaysBetween(startDate, finishDate) : 0
  const plannedPercent = startDate != null && finishDate != null ? 100 : null
  return { durationDays, startDate, finishDate, plannedPercent }
}

/**
 * Live 节点 rows: first row is the project name (displayed as 里程碑),
 * followed by Gantt milestone tasks.
 */
export function buildLiveNodeFeatureRows(
  seeds: readonly GanttNodeSeed[],
  project: { name: string; code?: string | null } | null,
  applicable: string = 'all',
): PmFeatureRow[] {
  const rows: PmFeatureRow[] = []
  if (project) {
    const projectName = project.name.trim()
    const code = project.code?.trim() ?? ''
    rows.push({
      id: liveNodeFeatureId('__project__'),
      type: 'node',
      name: code && projectName ? `${code} · ${projectName}` : projectName || code || '—',
      unit: '',
      pricingUnit: '',
      purchaseCycle: null,
      transportCycle: null,
      quantity: null,
      remark: '',
      code: '',
      featureDescription: '',
      sectionalWork: '',
      unitPrice: null,
      applicable,
      sortOrder: 0,
      parentId: null,
    })
  }

  const projectRowId = rows[0]?.id ?? null
  seeds.forEach((seed, index) => {
    rows.push({
      id: liveNodeFeatureId(seed.workItemId),
      type: 'node',
      name: seed.name,
      unit: '',
      pricingUnit: '',
      purchaseCycle: null,
      transportCycle: null,
      quantity: null,
      remark: '',
      code: '',
      featureDescription: '',
      sectionalWork: '',
      unitPrice: null,
      applicable,
      sortOrder: index + 1,
      parentId: projectRowId,
    })
  })

  return rows
}

/** Rollups for live 节点 rows (duration + finish + planned % from Gantt milestones). */
export function computeFeatureNodeRollups(
  seeds: readonly GanttNodeSeed[],
  features: readonly PmFeatureRow[],
  workItems: readonly PmWorkItem[] = [],
): Map<string, FeatureNodeRollup> {
  const byWorkItemId = new Map(seeds.map((seed) => [seed.workItemId, seed] as const))
  const fromWorkItems = scheduleDateEnvelope(workItems)
  const fromSeeds = dateEnvelopeFromBounds(
    seeds.map((seed) => seed.startDate),
    seeds.map((seed) => seed.finishDate),
  )
  const scheduleRange = {
    startDate: fromWorkItems.startDate ?? fromSeeds.startDate,
    finishDate: fromWorkItems.finishDate ?? fromSeeds.finishDate,
  }
  const projectEnvelope = projectNodeEnvelope(scheduleRange)
  const result = new Map<string, FeatureNodeRollup>()
  const empty: FeatureNodeRollup = {
    durationDays: 0,
    startDate: null,
    finishDate: null,
    plannedPercent: null,
  }

  for (const feature of features) {
    if (feature.type !== 'node') continue
    const workItemId = parseLiveNodeWorkItemId(feature.id)
    if (workItemId === '__project__') {
      result.set(feature.id, projectEnvelope)
      continue
    }
    if (workItemId) {
      const seed = byWorkItemId.get(workItemId)
      if (seed) {
        const asOf = seed.finishDate ?? seed.startDate
        result.set(feature.id, {
          durationDays: seed.durationDays,
          startDate: seed.startDate,
          finishDate: seed.finishDate,
          plannedPercent: plannedPercentAlongSchedule(
            asOf,
            scheduleRange.startDate,
            scheduleRange.finishDate,
          ),
        })
        continue
      }
    }
    result.set(feature.id, empty)
  }

  return result
}
