import type {
  PmDomain,
  PmWorkItemPriority,
  PmWorkItemStatus,
  PmWorkItemType,
} from '@toolman/shared'
import { PM_VERTICAL_DOMAINS } from '@toolman/shared'

export const SEEDABLE_DOMAINS: PmDomain[] = [
  'cost_management',
  'progress_management',
  ...PM_VERTICAL_DOMAINS,
]

/** Canonical domain for the shared 6-project demo portfolio. */
export const PM_DEMO_PORTFOLIO_DOMAIN: PmDomain = 'progress_management'

export type DemoWorkItemSeed = {
  key: string
  parentKey?: string
  type: PmWorkItemType
  title: string
  status: PmWorkItemStatus
  priority: PmWorkItemPriority
  progressPercent: number
  sortOrder: number
  description?: string
  assignee?: string
  startDate?: number
  dueDate?: number
  metadata?: Record<string, unknown>
}

export function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000
}

export function isMockSeedProject(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.source === 'mock_seed'
}

export function mockProjectKey(metadata: Record<string, unknown> | undefined, code: string): string {
  const mockId = metadata?.mockProjectId
  return typeof mockId === 'string' && mockId.length > 0 ? mockId : code
}
