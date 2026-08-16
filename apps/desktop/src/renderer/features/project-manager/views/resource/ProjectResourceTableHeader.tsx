import type { ProjectResourceTablePanelState } from './useProjectResourceTablePanel'
import { ProjectResourceTableColgroup } from './ProjectResourceTableColgroup'

export function ProjectResourceTableHeader({
  state,
}: {
  state: ProjectResourceTablePanelState
}) {
  const {
    t,
    isPractice,
    columnVisibility,
    selectionMode,
    visibleRows,
    checkedIds,
    handleSelectAll,
    handleClearSelection,
    practiceColumnLabel,
    openColumnVisibilityMenu,
    headerPinInnerRef,
  } = state

  return (
    <div className="tm-pm-resource-table-header-pin">
      <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
        <div className="tm-pm-resource-table-scroll-inner">
          <table className="tm-pm-resource-table">
            <ProjectResourceTableColgroup state={state} />
            <thead onContextMenu={openColumnVisibilityMenu}>
              <tr>
                <th className="tm-pm-resource-table-col-index">
                  {selectionMode ? (
                    <label
                      className="tm-kb-file-card-select"
                      title={t('projectManagerPage.resourceTable.selection.selectAll')}>
                      <input
                        type="checkbox"
                        className="tm-kb-file-card-select-input"
                        checked={
                          visibleRows.length > 0 &&
                          visibleRows.every((row) => checkedIds.has(row.id))
                        }
                        onChange={(event) => {
                          if (event.target.checked) handleSelectAll()
                          else handleClearSelection()
                        }}
                        aria-label={t('projectManagerPage.resourceTable.selection.selectAll')}
                      />
                      <span
                        className={[
                          'tm-kb-file-card-select-box',
                          visibleRows.length > 0 &&
                          visibleRows.every((row) => checkedIds.has(row.id))
                            ? 'tm-kb-file-card-select-box--checked'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden="true"
                      />
                    </label>
                  ) : (
                    practiceColumnLabel('index')
                  )}
                </th>
                {columnVisibility.type ? (
                  <th className="tm-pm-resource-table-col-type">
                    {practiceColumnLabel('type')}
                  </th>
                ) : null}
                {isPractice ? (
                  <>
                    {columnVisibility.spec ? (
                      <th className="tm-pm-resource-table-col-spec">
                        {practiceColumnLabel('spec')}
                      </th>
                    ) : null}
                    {columnVisibility.name ? (
                      <th className="tm-pm-resource-table-col-name">
                        {practiceColumnLabel('name')}
                      </th>
                    ) : null}
                  </>
                ) : (
                  <>
                    {columnVisibility.name ? (
                      <th className="tm-pm-resource-table-col-name">
                        {practiceColumnLabel('name')}
                      </th>
                    ) : null}
                    {columnVisibility.spec ? (
                      <th className="tm-pm-resource-table-col-spec">
                        {practiceColumnLabel('spec')}
                      </th>
                    ) : null}
                  </>
                )}
                {columnVisibility.unit ? (
                  <th className="tm-pm-resource-table-col-unit">
                    {practiceColumnLabel('unit')}
                  </th>
                ) : null}
                {columnVisibility.pricingUnit ? (
                  <th className="tm-pm-resource-table-col-pricing-unit">
                    {practiceColumnLabel('pricingUnit')}
                  </th>
                ) : null}
                {columnVisibility.unitPrice ? (
                  <th className="tm-pm-resource-table-col-price">
                    {practiceColumnLabel('unitPrice')}
                  </th>
                ) : null}
                {columnVisibility.baseline ? (
                  <th className="tm-pm-resource-table-col-baseline">
                    {practiceColumnLabel('baseline')}
                  </th>
                ) : null}
                {columnVisibility.note ? (
                  <th className="tm-pm-resource-table-col-note">
                    {practiceColumnLabel('note')}
                  </th>
                ) : null}
                <th className="tm-pm-resource-table-col-spacer" aria-hidden />
              </tr>
            </thead>
          </table>
        </div>
      </div>
    </div>
  )
}
