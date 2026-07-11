import type { EpcProjectRecord } from './epc-mock.js'
import { MOCK_EPC_PROJECTS } from './epc-mock.js'

export type EpcPortfolioAggregates = {
  projectCount: number
  contractTotal: number
  settledTotal: number
  pendingTotal: number
  avgProgress: number
  varianceRate: number
  overdueCount: number
  settlementRate: string
}

export function buildPortfolioAggregates(
  records: EpcProjectRecord[],
  options?: { overdueCount?: number },
): EpcPortfolioAggregates {
  const contractTotal = records.reduce((sum, project) => sum + project.contractValue, 0)
  const settledTotal = records.reduce((sum, project) => sum + project.settledAmount, 0)
  const pendingTotal = records.reduce((sum, project) => sum + project.pendingAmount, 0)
  const avgProgress =
    records.length > 0
      ? records.reduce((sum, project) => sum + project.progressPercent, 0) / records.length
      : 0
  const varianceRate =
    contractTotal > 0 ? ((contractTotal - settledTotal) / contractTotal) * 100 : 0
  const overdueCount =
    options?.overdueCount ??
    records.filter((project) => project.status !== 'normal').length
  const settlementRate =
    contractTotal > 0 ? ((settledTotal / contractTotal) * 100).toFixed(1) : '0'

  return {
    projectCount: records.length,
    contractTotal,
    settledTotal,
    pendingTotal,
    avgProgress,
    varianceRate,
    overdueCount,
    settlementRate,
  }
}

export function buildEpcPortfolioAggregates(): EpcPortfolioAggregates {
  return buildPortfolioAggregates(MOCK_EPC_PROJECTS)
}
