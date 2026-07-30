/**
 * Local metering periods for 价格表 · 计量 (create / select).
 * Stored per workspace + scope (project id or「全部项目」).
 */

export type MeteringBaseline = {
  id: string
  name: string
  /** YYYY-MM-DD status date */
  asOfDate: string
  createdAt: number
}

const STORAGE_PREFIX = 'toolman.pm.meteringBaselines'

function storageKey(workspaceId: string, scopeId: string): string {
  return `${STORAGE_PREFIX}.${workspaceId}.${scopeId}`
}

function parseBaselines(raw: unknown): MeteringBaseline[] {
  if (!Array.isArray(raw)) return []
  const next: MeteringBaseline[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    if (typeof row.id !== 'string' || !row.id) continue
    if (typeof row.name !== 'string' || !row.name.trim()) continue
    if (typeof row.asOfDate !== 'string' || !row.asOfDate.trim()) continue
    const createdAt =
      typeof row.createdAt === 'number' && Number.isFinite(row.createdAt)
        ? row.createdAt
        : Date.now()
    next.push({
      id: row.id,
      name: row.name.trim(),
      asOfDate: row.asOfDate.trim(),
      createdAt,
    })
  }
  return next.sort((left, right) => right.createdAt - left.createdAt)
}

export function readMeteringBaselines(
  workspaceId: string,
  scopeId: string,
): MeteringBaseline[] {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId, scopeId))
    if (!raw) return []
    return parseBaselines(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function writeMeteringBaselines(
  workspaceId: string,
  scopeId: string,
  baselines: readonly MeteringBaseline[],
): void {
  localStorage.setItem(storageKey(workspaceId, scopeId), JSON.stringify(baselines))
}

export function addMeteringBaseline(
  workspaceId: string,
  scopeId: string,
  input: { name: string; asOfDate: string },
): MeteringBaseline {
  const created: MeteringBaseline = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    asOfDate: input.asOfDate.trim(),
    createdAt: Date.now(),
  }
  const next = [created, ...readMeteringBaselines(workspaceId, scopeId)]
  writeMeteringBaselines(workspaceId, scopeId, next)
  return created
}

export function updateMeteringBaseline(
  workspaceId: string,
  scopeId: string,
  id: string,
  input: { name: string; asOfDate: string },
): MeteringBaseline | null {
  const current = readMeteringBaselines(workspaceId, scopeId)
  const index = current.findIndex((entry) => entry.id === id)
  if (index < 0) return null
  const updated: MeteringBaseline = {
    ...current[index]!,
    name: input.name.trim(),
    asOfDate: input.asOfDate.trim(),
  }
  const next = [...current]
  next[index] = updated
  writeMeteringBaselines(workspaceId, scopeId, next)
  return updated
}

export function deleteMeteringBaseline(
  workspaceId: string,
  scopeId: string,
  id: string,
): MeteringBaseline | null {
  const current = readMeteringBaselines(workspaceId, scopeId)
  const removed = current.find((entry) => entry.id === id) ?? null
  if (!removed) return null
  writeMeteringBaselines(
    workspaceId,
    scopeId,
    current.filter((entry) => entry.id !== id),
  )
  return removed
}

/** Match auto names: 周期N or legacy 基线N. */
const PERIOD_NAME_INDEX_RE = /^(?:周期|基线)\s*(\d+)/u

/** Next unused 周期N index among metering periods. */
export function nextMeteringPeriodIndex(
  periods: ReadonlyArray<{ name: string }>,
): number {
  const used = new Set<number>()
  for (const entry of periods) {
    const match = PERIOD_NAME_INDEX_RE.exec(entry.name.trim())
    if (!match) continue
    const n = Number.parseInt(match[1]!, 10)
    if (Number.isFinite(n) && n > 0) used.add(n)
  }
  let next = 1
  while (used.has(next)) next += 1
  return next
}

/** Default display name: 周期1 (2026-09-15) */
export function formatMeteringPeriodName(index: number, asOfDateLabel: string): string {
  const date = asOfDateLabel.trim()
  if (!date) return `周期${index}`
  return `周期${index} (${date})`
}

/** True when the name still looks like an auto-generated 周期N / legacy 基线N (…) label. */
export function isAutoMeteringPeriodName(name: string): boolean {
  return /^(?:周期|基线)\s*\d+(\s*[·(（].*)?$/u.test(name.trim())
}

/** Next default name: 周期1 (YYYY-MM-DD), … skipping numbers already used. */
export function nextMeteringPeriodName(
  periods: ReadonlyArray<{ name: string }>,
  asOfDateLabel = '',
): string {
  return formatMeteringPeriodName(nextMeteringPeriodIndex(periods), asOfDateLabel)
}

/** Extract the numeric suffix from an auto-generated period name (`周期3` -> `3`). */
export function parseMeteringPeriodNameIndex(name: string): number | null {
  const match = PERIOD_NAME_INDEX_RE.exec(name.trim())
  return match?.[1] ? Number.parseInt(match[1], 10) : null
}

/** How metering rows are rolled up in the 计量 view. */
export type MeteringRollupMode = 'none' | 'section' | 'custom'

const METERING_ROLLUP_MODES: ReadonlySet<string> = new Set(['none', 'section', 'custom'])

function rollupStorageKey(workspaceId: string, scopeId: string): string {
  return `toolman.pm.meteringRollupMode.${workspaceId}.${scopeId}`
}

export function readMeteringRollupMode(
  workspaceId: string,
  scopeId: string,
): MeteringRollupMode {
  try {
    const raw = localStorage.getItem(rollupStorageKey(workspaceId, scopeId))
    if (raw && METERING_ROLLUP_MODES.has(raw)) return raw as MeteringRollupMode
  } catch {
    // Ignore storage errors.
  }
  return 'none'
}

export function writeMeteringRollupMode(
  workspaceId: string,
  scopeId: string,
  mode: MeteringRollupMode,
): void {
  localStorage.setItem(rollupStorageKey(workspaceId, scopeId), mode)
}
