/** Draft builders and metadata helpers for `ProjectInfoDialog`. */

import type { PmProject } from '@toolman/shared'

import {
  COST_CURRENCIES_META_KEY,
  COST_CURRENCY_META_KEY,
  DEFAULT_COST_CURRENCY,
  normalizeCostCurrencies,
  readCostCurrencyState,
} from '../cost/pm-cost-currency'
import {
  parseProjectType,
  type CreateDefaults,
  type ProjectInfoDraft,
} from './pm-project-info-dialog-utils-types'

export function buildCostCurrencyMetadata(draft: ProjectInfoDraft): Record<string, unknown> {
  return {
    [COST_CURRENCIES_META_KEY]: normalizeCostCurrencies(draft.costCurrencies),
    [COST_CURRENCY_META_KEY]: draft.unsetCostCurrency.trim() || DEFAULT_COST_CURRENCY,
  }
}

function readMetaString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  return typeof value === 'string' ? value : value != null ? String(value) : ''
}

function readMetaNumber(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return value.trim()
  }
  return ''
}

export function emptyDraft(defaults?: Pick<CreateDefaults, 'code' | 'name'>): ProjectInfoDraft {
  return {
    code: defaults?.code ?? '',
    name: defaults?.name ?? '',
    status: 'planning',
    projectType: 'ordinary',
    description: '',
    workspaceRoot: '',
    planStart: '',
    planFinish: '',
    statusDate: '',
    scheduleFrom: 'project_start',
    planCalendar: 'calendar_days',
    planPhase: '',
    period: '',
    region: '',
    contractValue: '',
    settledAmount: '',
    progressPercent: '',
    costCurrencies: {},
    unsetCostCurrency: DEFAULT_COST_CURRENCY,
  }
}

export function toDraft(project: PmProject): ProjectInfoDraft {
  const metadata = project.metadata ?? {}
  return {
    code: project.code,
    name: project.name,
    status: project.status,
    projectType: parseProjectType(readMetaString(metadata, 'projectType')),
    description: project.description ?? '',
    workspaceRoot: project.workspaceRoot ?? '',
    planStart: readMetaString(metadata, 'planStartDate'),
    planFinish: readMetaString(metadata, 'planFinishDate'),
    statusDate: readMetaString(metadata, 'statusDate'),
    scheduleFrom:
      readMetaString(metadata, 'scheduleFrom') === 'project_finish'
        ? 'project_finish'
        : 'project_start',
    planCalendar:
      readMetaString(metadata, 'planCalendar') === 'working_days'
        ? 'working_days'
        : 'calendar_days',
    planPhase: readMetaString(metadata, 'planPhase'),
    period: readMetaString(metadata, 'period'),
    region: readMetaString(metadata, 'region'),
    contractValue: readMetaNumber(metadata, 'contractValue'),
    settledAmount: readMetaNumber(metadata, 'settledAmount'),
    progressPercent: readMetaNumber(metadata, 'progressPercent'),
    ...readCostCurrencyState(metadata, project.code),
  }
}

export function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

export function buildMetadata(
  draft: ProjectInfoDraft,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...base }
  const setMeta = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === '') delete metadata[key]
    else metadata[key] = value
  }
  setMeta('projectType', draft.projectType)
  setMeta('planStartDate', draft.planStart.trim() || undefined)
  setMeta('planFinishDate', draft.planFinish.trim() || undefined)
  setMeta('statusDate', draft.statusDate.trim() || undefined)
  setMeta('scheduleFrom', draft.scheduleFrom)
  setMeta('planCalendar', draft.planCalendar)
  setMeta('planPhase', draft.planPhase.trim() || undefined)
  setMeta('period', draft.period.trim() || undefined)
  setMeta('region', draft.region.trim() || undefined)
  setMeta('contractValue', parseOptionalNumber(draft.contractValue))
  setMeta('settledAmount', parseOptionalNumber(draft.settledAmount))
  setMeta('progressPercent', parseOptionalNumber(draft.progressPercent))
  Object.assign(metadata, buildCostCurrencyMetadata(draft))
  return metadata
}
