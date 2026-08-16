import type { ProjectManagementFilesPanelState } from './useProjectManagementFilesPanel'
import type { MatrixLayout } from './pm-files-panel-matrix-utils'
import type { CostColumnVisibility } from '../cost/pm-cost-column-prefs'

export type MatrixView = ProjectManagementFilesPanelState & {
  layout: MatrixLayout
  mCol: CostColumnVisibility
}
