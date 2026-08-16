import type { FC } from 'react'
import { ProjectManagementFilesPanelMatrixColgroup } from './ProjectManagementFilesPanelMatrixColgroup'
import { ProjectManagementFilesPanelMatrixHead } from './ProjectManagementFilesPanelMatrixHead'
import type { MatrixView } from './ProjectManagementFilesPanelMatrixView'

export const ProjectManagementFilesPanelMatrixHeader: FC<{ view: MatrixView }> = ({ view }) => {
  const {
    t,
    visibleRows,
    headerPinInnerRef,
    handleTableContextMenu,
    openColumnVisibilityMenu,
    layout,
  } = view
  return (
      <div className="tm-pm-resource-table-header-pin">
        <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
          <div
            className="tm-pm-resource-table-scroll-inner"
            onContextMenu={handleTableContextMenu}
          >
            {layout === 'vertical' ? (
              <table
                className="tm-pm-resource-table tm-pm-features-table--vertical"
                onContextMenu={handleTableContextMenu}
              >
                <colgroup>
                  <col className="tm-pm-resource-table-col-index" />
                  <col className="tm-pm-features-table-col-date" />
                  <col className="tm-pm-features-table-col-month" />
                  {visibleRows.map((row) => (
                    <col key={row.id} className="tm-pm-features-table-col-resource" />
                  ))}
                  <col className="tm-pm-resource-table-col-spacer" />
                </colgroup>
                <thead onContextMenu={openColumnVisibilityMenu}>
                  <tr>
                    <th className="tm-pm-resource-table-col-index">
                      {t('projectManagerPage.files.table.columns.index')}
                    </th>
                    <th className="tm-pm-features-table-col-date">
                      {t('projectManagerPage.files.table.columns.yearColumn')}
                    </th>
                    <th className="tm-pm-features-table-col-month">
                      {t('projectManagerPage.files.table.columns.monthColumn')}
                    </th>
                    {visibleRows.map((row) => (
                      <th
                        key={row.id}
                        className="tm-pm-features-table-col-resource"
                        title={row.name.trim() || undefined}
                      >
                        <span className="tm-pm-features-table-resource-label">
                          {row.name.trim() || '—'}
                        </span>
                      </th>
                    ))}
                    <th className="tm-pm-resource-table-col-spacer" aria-hidden />
                  </tr>
                </thead>
              </table>
            ) : (
              <table className="tm-pm-resource-table">
                <ProjectManagementFilesPanelMatrixColgroup view={view} />
                <ProjectManagementFilesPanelMatrixHead view={view} />
              </table>
            )}
          </div>
        </div>
      </div>
  )
}
