import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { useI18n } from '../../../../i18n/useI18n'
import { ProjectCostRowFilterOptions } from './ProjectCostRowFilterOptions'
import type { DatabaseRowFilter } from './pm-cost-row-filter'

export interface ProjectCostMenuBarSectionPanelProps {
  pos: { top: number; left: number } | null
  databaseRowFilter: DatabaseRowFilter
  subprojectOptions: readonly string[]
  sectionalOptions: readonly string[]
  onChange: (filter: DatabaseRowFilter) => void
}

/** 筛选 dropdown: 全部 + multi-select 子项目 / 分部工程. */
export const ProjectCostMenuBarSectionPanel: FC<ProjectCostMenuBarSectionPanelProps> = ({
  pos,
  databaseRowFilter,
  subprojectOptions,
  sectionalOptions,
  onChange,
}) => {
  const { t } = useI18n()
  if (!pos) return null

  return createPortal(
    <div
      className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
      role="menu"
      style={{ top: pos.top, left: pos.left }}
    >
      <ProjectCostRowFilterOptions
        t={t}
        filter={databaseRowFilter}
        subprojectOptions={subprojectOptions}
        sectionalOptions={sectionalOptions}
        onChange={onChange}
      />
    </div>,
    document.body,
  )
}
