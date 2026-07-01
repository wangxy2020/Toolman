export interface EpcProjectRecord {
  id: string
  code: string
  name: string
  contractValue: number
  settledAmount: number
  pendingAmount: number
  progressPercent: number
  planPhase: string
  period: string
  status: 'normal' | 'warning' | 'critical'
  region: string
}

export const MOCK_EPC_PROJECTS: EpcProjectRecord[] = [
  {
    id: 'p1',
    code: 'EPC-2401',
    name: '滨海 LNG 接收站扩建',
    contractValue: 128_500_000,
    settledAmount: 86_200_000,
    pendingAmount: 12_400_000,
    progressPercent: 72,
    planPhase: '施工',
    period: '2026-Q1',
    status: 'normal',
    region: '华东',
  },
  {
    id: 'p2',
    code: 'EPC-2408',
    name: '西北风光储一体化基地',
    contractValue: 96_800_000,
    settledAmount: 41_300_000,
    pendingAmount: 18_600_000,
    progressPercent: 48,
    planPhase: '采购',
    period: '2026-Q1',
    status: 'warning',
    region: '西北',
  },
  {
    id: 'p3',
    code: 'EPC-2315',
    name: '跨境输气管道标段 III',
    contractValue: 215_000_000,
    settledAmount: 198_400_000,
    pendingAmount: 4_200_000,
    progressPercent: 91,
    planPhase: '试运行',
    period: '2025-Q4',
    status: 'normal',
    region: '西南',
  },
  {
    id: 'p4',
    code: 'EPC-2502',
    name: '石化园区公用工程 EPC',
    contractValue: 74_200_000,
    settledAmount: 22_100_000,
    pendingAmount: 9_800_000,
    progressPercent: 31,
    planPhase: '前期',
    period: '2026-Q2',
    status: 'warning',
    region: '华北',
  },
  {
    id: 'p5',
    code: 'EPC-2209',
    name: '海水淡化及配套管网',
    contractValue: 52_600_000,
    settledAmount: 51_900_000,
    pendingAmount: 680_000,
    progressPercent: 98,
    planPhase: '竣工',
    period: '2025-Q4',
    status: 'normal',
    region: '华南',
  },
  {
    id: 'p6',
    code: 'EPC-2412',
    name: '矿区生态修复总承包',
    contractValue: 38_400_000,
    settledAmount: 11_200_000,
    pendingAmount: 6_500_000,
    progressPercent: 26,
    planPhase: '施工',
    period: '2026-Q2',
    status: 'critical',
    region: '华北',
  },
]

export function formatProjectMoney(value: number): string {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)} 万`
  }
  return value.toLocaleString('zh-CN')
}
