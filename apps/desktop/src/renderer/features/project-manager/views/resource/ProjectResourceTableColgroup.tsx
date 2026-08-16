import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'

export function ProjectResourceTableColgroup({
  state,
}: {
  state: ProjectResourceTablePanelState
}) {
  const { columnVisibility, isPractice } = state
  return (
    <colgroup>
      <col className="tm-pm-resource-table-col-index" />
      {columnVisibility.type ? <col className="tm-pm-resource-table-col-type" /> : null}
      {isPractice ? (
        <>
          {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
          {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
        </>
      ) : (
        <>
          {columnVisibility.name ? <col className="tm-pm-resource-table-col-name" /> : null}
          {columnVisibility.spec ? <col className="tm-pm-resource-table-col-spec" /> : null}
        </>
      )}
      {columnVisibility.unit ? <col className="tm-pm-resource-table-col-unit" /> : null}
      {columnVisibility.pricingUnit ? (
        <col className="tm-pm-resource-table-col-pricing-unit" />
      ) : null}
      {columnVisibility.unitPrice ? <col className="tm-pm-resource-table-col-price" /> : null}
      {columnVisibility.baseline ? (
        <col className="tm-pm-resource-table-col-baseline" />
      ) : null}
      {columnVisibility.note ? <col className="tm-pm-resource-table-col-note" /> : null}
      <col className="tm-pm-resource-table-col-spacer" />
    </colgroup>
  )
}
