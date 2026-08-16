import { useEffect } from 'react'
import type { PmProject } from '@toolman/shared'
import { pmApi } from '../../pm-api'
import {
  buildLiveFundsFeatureRows,
  buildLiveNodeFeatureRows,
  buildLiveProcurementFeatureRows,
  buildLiveScheduleFeatureRows,
  excludeProcurementRowsCoveredByLive,
} from './pm-feature-gantt-rollup'
import {
  PM_FEATURE_APPLICABLE_ALL,
  PM_FEATURE_CATALOG_KEY,
  readSharedFeatureCatalog,
  reindexFeatureRows,
  resolveProjectFeatureCatalog,
  stripLiveFeatureRows,
  writeSharedFeatureCatalog,
  type PmFeatureRow,
} from './pm-features-catalog'

export function useProjectManagementFilesHydrate(args: {
  workspaceId: string
  isAllScope: boolean
  dirty: boolean
  editingProject: PmProject | null
  scopeKey: string
  ganttSeeds: Parameters<typeof buildLiveScheduleFeatureRows>[0]
  costSeeds: Parameters<typeof buildLiveFundsFeatureRows>[0]
  procurementSeeds: Parameters<typeof buildLiveProcurementFeatureRows>[0]
  nodeSeeds: Parameters<typeof buildLiveNodeFeatureRows>[0]
  assignableResourceCatalog: Parameters<typeof buildLiveScheduleFeatureRows>[1]
  setRows: (rows: PmFeatureRow[]) => void
  onProjectsChange?: () => void
}) {
  const {
    workspaceId, isAllScope, dirty, editingProject, scopeKey, ganttSeeds, costSeeds,
    procurementSeeds, nodeSeeds, assignableResourceCatalog, setRows, onProjectsChange,
  } = args

  useEffect(() => {
    if (dirty) return

    if (isAllScope) {
      const shared = readSharedFeatureCatalog(workspaceId)
      const stripped = stripLiveFeatureRows(shared.rows)
      if (shared.isDefault || stripped.changed) {
        writeSharedFeatureCatalog(workspaceId, stripped.rows)
      }
      const liveProcurement = buildLiveProcurementFeatureRows(
        procurementSeeds,
        assignableResourceCatalog,
        stripped.rows,
        PM_FEATURE_APPLICABLE_ALL,
      )
      const liveNodes = buildLiveNodeFeatureRows(nodeSeeds, null, PM_FEATURE_APPLICABLE_ALL)
      setRows(
        reindexFeatureRows([
          ...buildLiveScheduleFeatureRows(
            ganttSeeds,
            assignableResourceCatalog,
            [],
            PM_FEATURE_APPLICABLE_ALL,
          ),
          ...buildLiveFundsFeatureRows(costSeeds, [], PM_FEATURE_APPLICABLE_ALL),
          ...liveProcurement,
          ...liveNodes,
          ...excludeProcurementRowsCoveredByLive(stripped.rows, liveProcurement),
        ]),
      )
      return
    }

    if (!editingProject) {
      setRows([])
      return
    }

    const resolved = resolveProjectFeatureCatalog(
      workspaceId,
      editingProject.id,
      editingProject.metadata,
    )
    const stripped = stripLiveFeatureRows(resolved.rows)
    const liveProcurement = buildLiveProcurementFeatureRows(
      procurementSeeds,
      assignableResourceCatalog,
      stripped.rows,
      PM_FEATURE_APPLICABLE_ALL,
    )
    const liveNodes = buildLiveNodeFeatureRows(
      nodeSeeds,
      { name: editingProject.name, code: editingProject.code },
      PM_FEATURE_APPLICABLE_ALL,
    )
    setRows(
      reindexFeatureRows([
        ...buildLiveScheduleFeatureRows(
          ganttSeeds,
          assignableResourceCatalog,
          [],
          PM_FEATURE_APPLICABLE_ALL,
        ),
        ...buildLiveFundsFeatureRows(costSeeds, [], PM_FEATURE_APPLICABLE_ALL),
        ...liveProcurement,
        ...liveNodes,
        ...excludeProcurementRowsCoveredByLive(stripped.rows, liveProcurement),
      ]),
    )
    if (resolved.needsPersist || stripped.changed) {
      void pmApi
        .updateProject({
          id: editingProject.id,
          metadata: { [PM_FEATURE_CATALOG_KEY]: stripped.rows },
        })
        .then(() => onProjectsChange?.())
        .catch(() => {
          // Keep catalog in memory even if seed write fails.
        })
    }
  }, [
    assignableResourceCatalog,
    costSeeds,
    dirty,
    editingProject,
    ganttSeeds,
    isAllScope,
    nodeSeeds,
    onProjectsChange,
    procurementSeeds,
    scopeKey,
    workspaceId,
  ])

}
