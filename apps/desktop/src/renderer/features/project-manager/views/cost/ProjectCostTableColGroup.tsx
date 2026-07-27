import type { FC } from 'react'

import type { CostColumnVisibility } from './pm-cost-column-prefs'

export interface ProjectCostTableColGroupProps {
  columnVisibility: CostColumnVisibility
}

/** Shared `<colgroup>` for the pinned header table and the scrollable body table (must stay in sync). */
export const ProjectCostTableColGroup: FC<ProjectCostTableColGroupProps> = ({
  columnVisibility,
}) => {
  return (
    <colgroup>
      <col className="tm-pm-resource-table-col-index" />
      {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
      {columnVisibility.sectionalWork ? (
        <col className="tm-pm-resource-table-col-sectional" />
      ) : null}
      {columnVisibility.code ? <col className="tm-pm-resource-table-col-code" /> : null}
      {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
      {columnVisibility.featureDescription ? (
        <col className="tm-pm-resource-table-col-feature" />
      ) : null}
      {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
      {columnVisibility.quantity ? <col className="tm-pm-resource-table-col-spec" /> : null}
      {columnVisibility.unitPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
      {columnVisibility.totalPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
      {columnVisibility.baseline ? <col className="tm-pm-resource-table-col-baseline" /> : null}
      {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
      <col className="tm-pm-resource-table-col-spacer" />
    </colgroup>
  )
}
