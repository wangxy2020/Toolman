/** Multi-condition 子项目 / 分部工程 filter for cost tables. */

export type DatabaseRowFilter = {
  subprojects: string[]
  sectionalWorks: string[]
}

export const ALL_DATABASE_ROW_FILTER: DatabaseRowFilter = {
  subprojects: [],
  sectionalWorks: [],
}

export function isDatabaseRowFilterAll(filter: DatabaseRowFilter): boolean {
  return filter.subprojects.length === 0 && filter.sectionalWorks.length === 0
}

export function toggleDatabaseRowFilterValue(
  filter: DatabaseRowFilter,
  field: 'subprojects' | 'sectionalWorks',
  value: string,
): DatabaseRowFilter {
  const current = filter[field]
  const nextValues = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value]
  return { ...filter, [field]: nextValues }
}

export function matchesDatabaseRowFilter(
  row: { subproject?: string | null; sectionalWork?: string | null },
  filter: DatabaseRowFilter,
): boolean {
  if (filter.subprojects.length > 0) {
    if (!filter.subprojects.includes(row.subproject?.trim() ?? '')) return false
  }
  if (filter.sectionalWorks.length > 0) {
    if (!filter.sectionalWorks.includes(row.sectionalWork?.trim() ?? '')) return false
  }
  return true
}

function orderedSelected(selected: readonly string[], options: readonly string[]): string[] {
  const set = new Set(selected)
  return options.filter((value) => set.has(value))
}

export function formatDatabaseRowFilterLabel(
  filter: DatabaseRowFilter,
  options: {
    allLabel: string
    optionLabel: (value: string) => string
    subprojectOptions?: readonly string[]
    sectionalOptions?: readonly string[]
    listJoin?: string
    groupJoin?: string
  },
): string {
  if (isDatabaseRowFilterAll(filter)) return options.allLabel
  const listJoin = options.listJoin ?? '、'
  const groupJoin = options.groupJoin ?? ' · '
  const subValues = orderedSelected(filter.subprojects, options.subprojectOptions ?? filter.subprojects)
  const sectionValues = orderedSelected(
    filter.sectionalWorks,
    options.sectionalOptions ?? filter.sectionalWorks,
  )
  const subLabel = subValues.map(options.optionLabel).join(listJoin)
  const sectionLabel = sectionValues.map(options.optionLabel).join(listJoin)
  if (subLabel && sectionLabel) return `${subLabel}${groupJoin}${sectionLabel}`
  return subLabel || sectionLabel
}

export function encodeDatabaseRowFilterSelect(filter: DatabaseRowFilter): string {
  if (isDatabaseRowFilterAll(filter)) return 'all'
  if (filter.subprojects.length === 1 && filter.sectionalWorks.length === 0) {
    return `subproject\u001f${filter.subprojects[0]}`
  }
  if (filter.sectionalWorks.length === 1 && filter.subprojects.length === 0) {
    return `sectionalWork\u001f${filter.sectionalWorks[0]}`
  }
  return 'all'
}

export function parseDatabaseRowFilterSelect(raw: string): DatabaseRowFilter {
  if (raw === 'all') return ALL_DATABASE_ROW_FILTER
  const split = raw.indexOf('\u001f')
  if (split < 0) return ALL_DATABASE_ROW_FILTER
  const kind = raw.slice(0, split)
  const value = raw.slice(split + 1)
  if (kind === 'subproject') return { subprojects: [value], sectionalWorks: [] }
  if (kind === 'sectionalWork') return { subprojects: [], sectionalWorks: [value] }
  return ALL_DATABASE_ROW_FILTER
}
