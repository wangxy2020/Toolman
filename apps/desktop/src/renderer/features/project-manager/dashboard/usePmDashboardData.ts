import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildEpcPortfolioAggregates,
  buildPmPortfolioAggregates,
  buildPmProjectDashboardRecords,
  dedupePmProjectsByCode,
  MOCK_EPC_PROJECTS,
  type EpcPortfolioAggregates,
  type EpcProjectRecord,
  type PmDomain,
  type PmProject,
  type PmWorkItem,
} from '@toolman/shared'

import { pmApi } from '../pm-api'

interface Options {
  domain?: PmDomain
  dedupeByCode?: boolean
  mockFallback?: boolean
}

export interface PmDashboardData {
  records: EpcProjectRecord[]
  aggregates: EpcPortfolioAggregates
  projects: PmProject[]
  workItems: PmWorkItem[]
  source: 'sqlite' | 'mock'
}

export function buildMockPmDashboardData(): PmDashboardData {
  return {
    records: MOCK_EPC_PROJECTS,
    aggregates: buildEpcPortfolioAggregates(),
    projects: [],
    workItems: [],
    source: 'mock',
  }
}

export function usePmDashboardData(workspaceId: string | undefined, options: Options = {}) {
  const { domain, dedupeByCode = false, mockFallback = true } = options
  const [data, setData] = useState<PmDashboardData | null>(null)
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [error, setError] = useState<string | null>(null)
  const hasDataRef = useRef(false)

  const reload = useCallback(async () => {
    if (!workspaceId) {
      const fallback = mockFallback ? buildMockPmDashboardData() : null
      setData(fallback)
      hasDataRef.current = fallback != null
      setLoading(false)
      setError(null)
      return
    }

    if (!hasDataRef.current) {
      setLoading(true)
    }
    setError(null)
    try {
      const projectResult = await pmApi.listProjects(workspaceId, domain)
      const projects = dedupeByCode
        ? dedupePmProjectsByCode(projectResult.projects)
        : projectResult.projects
      const itemResult = await pmApi.listWorkItems({
        workspaceId,
        domain,
        limit: 1000,
      })
      const projectIds = new Set(projects.map((project) => project.id))
      const workItems = itemResult.items.filter((item) => projectIds.has(item.projectId))
      const records = buildPmProjectDashboardRecords(projects, workItems)
      const aggregates = buildPmPortfolioAggregates(projects, workItems)

      if (records.length === 0 && mockFallback) {
        setData(buildMockPmDashboardData())
      } else {
        setData({ records, aggregates, projects, workItems, source: 'sqlite' })
      }
      hasDataRef.current = true
    } catch (err) {
      if (mockFallback) {
        setData(buildMockPmDashboardData())
        hasDataRef.current = true
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : String(err))
        if (!hasDataRef.current) {
          setData(null)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [dedupeByCode, domain, mockFallback, workspaceId])

  useEffect(() => {
    hasDataRef.current = false
    void reload()
  }, [reload])

  return { data, loading, error, reload }
}
