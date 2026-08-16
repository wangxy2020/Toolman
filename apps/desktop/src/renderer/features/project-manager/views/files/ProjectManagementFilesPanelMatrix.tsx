import type { FC } from 'react'

import {
  resolveMatrixLayout,
  resolveMeteringColumnVisibility,
} from './pm-files-panel-matrix-utils'
import type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'
import { ProjectManagementFilesPanelMatrixHeader } from './ProjectManagementFilesPanelMatrixHeader'
import { ProjectManagementFilesPanelMatrixBody } from './ProjectManagementFilesPanelMatrixBody'

export interface ProjectManagementFilesPanelMatrixProps {
  state: ProjectManagementFilesPanelState
}

/**
 * The pinned header + scrollable body matrix tables (horizontal resources-as-rows layout,
 * or vertical months-as-rows layout). Both tables must stay column-aligned, so they're
 * rendered together rather than split further.
 */
export const ProjectManagementFilesPanelMatrix: FC<ProjectManagementFilesPanelMatrixProps> = ({
  state,
}) => {
  const layout = resolveMatrixLayout(state.isMeteringCostView, state.matrixLayout)
  const mCol = resolveMeteringColumnVisibility(state.meteringColumnVisibility)
  const view: MatrixView = { ...state, layout, mCol }
  return (
    <>
      <ProjectManagementFilesPanelMatrixHeader view={view} />
      <ProjectManagementFilesPanelMatrixBody view={view} />
    </>
  )
}
