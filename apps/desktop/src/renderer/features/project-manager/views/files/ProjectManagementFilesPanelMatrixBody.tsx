import type { FC } from 'react'
import { resolveMatrixDisplayEntries } from './pm-files-panel-matrix-utils'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'
import { ProjectManagementFilesPanelMatrixColgroup } from './ProjectManagementFilesPanelMatrixColgroup'
import { ProjectManagementFilesPanelMatrixSectionRow } from './ProjectManagementFilesPanelMatrixSectionRow'
import { ProjectManagementFilesPanelMatrixRow } from './ProjectManagementFilesPanelMatrixRow'
import { ProjectManagementFilesPanelMatrixTotals } from './ProjectManagementFilesPanelMatrixTotals'
import { ProjectManagementFilesPanelMatrixVertical } from './ProjectManagementFilesPanelMatrixVertical'

export const ProjectManagementFilesPanelMatrixBody: FC<{ view: MatrixView }> = ({ view }) => {
  const {
    isFundsView,
    isMeteringCostView,
    fundsDisplayEntries,
    visibleRows,
    tableScrollRef,
    syncHScrollMetrics,
    handleTableContextMenu,
    layout,
    mCol,
  } = view
  return (
      <div
        ref={tableScrollRef}
        className="tm-pm-resource-table-scroll"
        onScroll={() => syncHScrollMetrics()}
        onWheel={(event) => {
          if (event.deltaX !== 0 && tableScrollRef.current) {
            tableScrollRef.current.scrollLeft += event.deltaX
          }
        }}
      >
        <div className="tm-pm-resource-table-scroll-inner" onContextMenu={handleTableContextMenu}>
          {layout === 'vertical' ? (
            <ProjectManagementFilesPanelMatrixVertical view={view} />
          ) : (
            <table className="tm-pm-resource-table">
              <ProjectManagementFilesPanelMatrixColgroup view={view} />
              <tbody>
                {(() => {
                  const displayEntries = resolveMatrixDisplayEntries(
                    isFundsView,
                    fundsDisplayEntries,
                    visibleRows,
                  )
                  let detailIndex = 0
                  const entryRows = displayEntries.map((entry) => {
                    if (entry.kind === 'section') {
                      return (
                        <ProjectManagementFilesPanelMatrixSectionRow
                          key={entry.id}
                          view={view}
                          entry={entry}
                        />
                      )
                    }
                    detailIndex += 1
                    return (
                      <ProjectManagementFilesPanelMatrixRow
                        key={entry.row.id}
                        view={view}
                        entry={entry}
                        rowNumber={detailIndex}
                      />
                    )
                  })
                  if (isMeteringCostView && displayEntries.length === 0) {
                    return (
                      <tr
                        key="__metering-col-scaffold"
                        className="tm-pm-resource-table-row--col-scaffold"
                        aria-hidden
                      >
                        <td className="tm-pm-resource-table-index" />
                        {mCol.type ? <td className="tm-pm-resource-table-col-type" /> : null}
                        {mCol.sectionalWork ? (
                          <td className="tm-pm-resource-table-col-sectional" />
                        ) : null}
                        {mCol.code ? <td className="tm-pm-resource-table-col-code" /> : null}
                        {mCol.name ? <td className="tm-pm-resource-table-col-name" /> : null}
                        {mCol.featureDescription ? (
                          <td className="tm-pm-resource-table-col-feature" />
                        ) : null}
                        {mCol.unit ? <td className="tm-pm-resource-table-col-unit" /> : null}
                        {mCol.quantity ? <td className="tm-pm-resource-table-col-spec" /> : null}
                        {mCol.unitPrice ? <td className="tm-pm-resource-table-col-price" /> : null}
                        {mCol.totalPrice ? <td className="tm-pm-resource-table-col-price" /> : null}
                        {mCol.baseline ? (
                          <td className="tm-pm-resource-table-col-baseline" />
                        ) : null}
                        {mCol.note ? <td className="tm-pm-resource-table-col-note" /> : null}
                        <td className="tm-pm-resource-table-col-spacer" />
                      </tr>
                    )
                  }
                  return entryRows
                })()}
                <ProjectManagementFilesPanelMatrixTotals view={view} />
              </tbody>
            </table>
          )}
        </div>
      </div>
  )
}
