import type { ReactNode } from 'react'

export type ProjectDashboardVariant = 'cost' | 'progress'

export type TrendDirection = 'up' | 'down' | null

export type KpiCardModel = {
  key: string
  label: string
  value: string
  sub: string
  trend: TrendDirection
  delta: string
  icon: ReactNode
}

export function interpolateTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  )
}
