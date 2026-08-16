import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { PmProject } from '@toolman/shared'
import {
  buildLiveFundsFeatureRows,
  buildLiveNodeFeatureRows,
  buildLiveProcurementFeatureRows,
  buildLiveScheduleFeatureRows,
  excludeProcurementRowsCoveredByLive,
} from './pm-feature-gantt-rollup'
import {
  reindexFeatureRows,
  type PmFeatureRow,
} from './pm-features-catalog'

export function useProjectManagementFilesCatalog(args: {
  viewApplicable: string
  editingProject: PmProject | null
  ganttSeeds: Parameters<typeof buildLiveScheduleFeatureRows>[0]
  costSeeds: Parameters<typeof buildLiveFundsFeatureRows>[0]
  procurementSeeds: Parameters<typeof buildLiveProcurementFeatureRows>[0]
  nodeSeeds: Parameters<typeof buildLiveNodeFeatureRows>[0]
  assignableResourceCatalog: Parameters<typeof buildLiveScheduleFeatureRows>[1]
  setRows: Dispatch<SetStateAction<PmFeatureRow[]>>
  setDirty: Dispatch<SetStateAction<boolean>>
}) {
  const {
    viewApplicable, editingProject, ganttSeeds, costSeeds, procurementSeeds, nodeSeeds,
    assignableResourceCatalog, setRows, setDirty,
  } = args
  const updateRows = useCallback((updater: (prev: PmFeatureRow[]) => PmFeatureRow[]) => {
    setRows((prev) => reindexFeatureRows(updater(prev)))
    setDirty(true)
  }, [setDirty, setRows])

  const applyCatalogRows = useCallback(
    (persisted: PmFeatureRow[], options?: { dirty?: boolean }) => {
      const liveProcurement = buildLiveProcurementFeatureRows(
        procurementSeeds,
        assignableResourceCatalog,
        persisted,
        viewApplicable,
      )
      const liveNodes = buildLiveNodeFeatureRows(
        nodeSeeds,
        editingProject
          ? { name: editingProject.name, code: editingProject.code }
          : null,
        viewApplicable,
      )
      const live = [
        ...buildLiveScheduleFeatureRows(
          ganttSeeds,
          assignableResourceCatalog,
          [],
          viewApplicable,
        ),
        ...buildLiveFundsFeatureRows(costSeeds, [], viewApplicable),
        ...liveProcurement,
        ...liveNodes,
      ]
      setRows(
        reindexFeatureRows([
          ...live,
          ...excludeProcurementRowsCoveredByLive(persisted, liveProcurement),
        ]),
      )
      setDirty(options?.dirty ?? false)
    },
    [
      assignableResourceCatalog,
      costSeeds,
      editingProject,
      ganttSeeds,
      nodeSeeds,
      procurementSeeds,
      viewApplicable,
    ],
  )

  return { updateRows, applyCatalogRows }
}
