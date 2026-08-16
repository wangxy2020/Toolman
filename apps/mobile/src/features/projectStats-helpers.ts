import {
  formatProjectMoney,
  type EpcPortfolioAggregates,
  type EpcProjectRecord,
} from '@toolman/shared'
import type { ProjectKpiIconName } from '../icons/project-kpi-icons'

export type ProjectStatsTrend = 'up' | 'down' | null

export type ProjectKpiCard = {
  key: string
  label: string
  value: string
  sub: string
  trend: ProjectStatsTrend
  delta: string
  icon: ProjectKpiIconName
}

export type ProjectStatsSection = {
  title: string
  desc: string
}

export type ProjectInsightCard = {
  key: string
  title: string
  value: string
  desc: string
}

export type ProjectStatsModel = {
  variant: 'cost' | 'progress'
  kpis: ProjectKpiCard[]
  section: ProjectStatsSection | null
  records: EpcProjectRecord[]
  insights: ProjectInsightCard[]
  emptyHint: string
}

export function interpolate(template: string, value: string | number): string {
  return template.replaceAll('{{value}}', String(value))
}

export function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

export function projectSettlementRate(project: EpcProjectRecord): number {
  return project.contractValue > 0 ? (project.settledAmount / project.contractValue) * 100 : 0
}

export function projectOverviewFlags(project: EpcProjectRecord): {
  warnPending: boolean
  warnStatus: boolean
} {
  return {
    warnPending: project.pendingAmount > 10_000_000,
    warnStatus: project.status !== 'normal',
  }
}

export function projectOverviewProgressCopy(
  variant: 'cost' | 'progress',
  progressPercent: number,
  settlementRate: number,
): { left: string; right: string } {
  return {
    left:
      variant === 'cost'
        ? interpolate('进度 {{value}}%', progressPercent)
        : interpolate('计划 {{value}}%', progressPercent),
    right:
      variant === 'cost'
        ? interpolate('结算率 {{value}}%', settlementRate.toFixed(0))
        : interpolate('完成率 {{value}}%', settlementRate.toFixed(0)),
  }
}

export function clampProgressPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function kpi(
  key: string,
  label: string,
  value: string,
  sub: string,
  icon: ProjectKpiIconName,
  trend: ProjectStatsTrend = null,
  delta = '',
): ProjectKpiCard {
  return { key, label, value, sub, icon, trend, delta }
}

export function projectStatusLabel(status: EpcProjectRecord['status']): string {
  if (status === 'critical') return '高风险'
  if (status === 'warning') return '需关注'
  return '正常'
}

export type { EpcPortfolioAggregates, EpcProjectRecord }
export { formatProjectMoney }
