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

export function buildEpcPortfolioAggregates(): EpcPortfolioAggregates {
  const contractTotal = MOCK_EPC_PROJECTS.reduce((sum, project) => sum + project.contractValue, 0)
  const settledTotal = MOCK_EPC_PROJECTS.reduce((sum, project) => sum + project.settledAmount, 0)
  const pendingTotal = MOCK_EPC_PROJECTS.reduce((sum, project) => sum + project.pendingAmount, 0)
  const avgProgress =
    MOCK_EPC_PROJECTS.length > 0
      ? MOCK_EPC_PROJECTS.reduce((sum, project) => sum + project.progressPercent, 0) /
        MOCK_EPC_PROJECTS.length
      : 0
  const varianceRate =
    contractTotal > 0 ? ((contractTotal - settledTotal) / contractTotal) * 100 : 0
  const overdueCount = MOCK_EPC_PROJECTS.filter((project) => project.status !== 'normal').length
  const settlementRate =
    contractTotal > 0 ? ((settledTotal / contractTotal) * 100).toFixed(1) : '0'

  return {
    projectCount: MOCK_EPC_PROJECTS.length,
    contractTotal,
    settledTotal,
    pendingTotal,
    avgProgress,
    varianceRate,
    overdueCount,
    settlementRate,
  }
}
