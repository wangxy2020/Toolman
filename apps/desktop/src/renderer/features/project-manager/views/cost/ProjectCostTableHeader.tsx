import type { FC, KeyboardEvent as ReactKeyboardEvent, Ref } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { ProjectCostTableColGroup } from './ProjectCostTableColGroup'
import type { CostLabelColumn } from './pm-cost-column-prefs'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

export interface ProjectCostTableHeaderProps {
  state: ProjectCostTablePanelState
}

type EditableHeaderCellProps = {
  column: CostLabelColumn
  className: string
  label: string
  editing: boolean
  draft: string
  inputRef: Ref<HTMLInputElement>
  onStartEdit: (column: CostLabelColumn) => void
  onDraftChange: (value: string) => void
  onCommit: () => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
}

const EditableHeaderCell: FC<EditableHeaderCellProps> = ({
  column,
  className,
  label,
  editing,
  draft,
  inputRef,
  onStartEdit,
  onDraftChange,
  onCommit,
  onKeyDown,
}) => (
  <th className={className} onDoubleClick={() => onStartEdit(column)}>
    {editing ? (
      <input
        ref={inputRef}
        className="tm-pm-table-header-input"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    ) : (
      label
    )}
  </th>
)

/** Header row pinned above the vertical scroll; horizontal position synced via transform. */
export const ProjectCostTableHeader: FC<ProjectCostTableHeaderProps> = ({ state }) => {
  const { t } = useI18n()
  const {
    headerPinInnerRef,
    columnVisibility,
    selectionMode,
    visibleRows,
    checkedIds,
    handleSelectAll,
    handleClearSelection,
    openColumnVisibilityMenu,
    costColumnLabel,
    editingHeaderColumn,
    headerDraft,
    setHeaderDraft,
    headerInputRef,
    startHeaderEdit,
    commitHeaderEdit,
    handleHeaderKeyDown,
  } = state

  const allChecked =
    visibleRows.length > 0 && visibleRows.every((row) => checkedIds.has(row.id))

  const renderEditable = (column: CostLabelColumn, className: string) => (
    <EditableHeaderCell
      key={column}
      column={column}
      className={className}
      label={costColumnLabel(column)}
      editing={editingHeaderColumn === column}
      draft={headerDraft}
      inputRef={editingHeaderColumn === column ? headerInputRef : null}
      onStartEdit={startHeaderEdit}
      onDraftChange={setHeaderDraft}
      onCommit={commitHeaderEdit}
      onKeyDown={handleHeaderKeyDown}
    />
  )

  return (
    <div className="tm-pm-resource-table-header-pin">
      <div ref={headerPinInnerRef} className="tm-pm-resource-table-header-pin-inner">
        <div className="tm-pm-resource-table-scroll-inner">
          <table className="tm-pm-resource-table">
            <ProjectCostTableColGroup columnVisibility={columnVisibility} />
            <thead onContextMenu={openColumnVisibilityMenu}>
              <tr>
                <th className="tm-pm-resource-table-col-index">
                  {selectionMode ? (
                    <label
                      className="tm-kb-file-card-select"
                      title={t('projectManagerPage.costTable.selection.selectAll')}
                    >
                      <input
                        type="checkbox"
                        className="tm-kb-file-card-select-input"
                        checked={allChecked}
                        onChange={(event) => {
                          if (event.target.checked) handleSelectAll()
                          else handleClearSelection()
                        }}
                        aria-label={t('projectManagerPage.costTable.selection.selectAll')}
                      />
                      <span
                        className={[
                          'tm-kb-file-card-select-box',
                          allChecked ? 'tm-kb-file-card-select-box--checked' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-hidden="true"
                      />
                    </label>
                  ) : (
                    costColumnLabel('index')
                  )}
                </th>
                {columnVisibility.type
                  ? renderEditable('type', 'tm-pm-resource-table-col-type')
                  : null}
                {columnVisibility.sectionalWork
                  ? renderEditable('sectionalWork', 'tm-pm-resource-table-col-sectional')
                  : null}
                {columnVisibility.code
                  ? renderEditable('code', 'tm-pm-resource-table-col-code')
                  : null}
                {columnVisibility.name
                  ? renderEditable('name', 'tm-pm-resource-table-col-name')
                  : null}
                {columnVisibility.featureDescription
                  ? renderEditable('featureDescription', 'tm-pm-resource-table-col-feature')
                  : null}
                {columnVisibility.unit
                  ? renderEditable('unit', 'tm-pm-resource-table-col-unit')
                  : null}
                {columnVisibility.quantity
                  ? renderEditable('quantity', 'tm-pm-resource-table-col-spec')
                  : null}
                {columnVisibility.unitPrice
                  ? renderEditable('unitPrice', 'tm-pm-resource-table-col-price')
                  : null}
                {columnVisibility.totalPrice
                  ? renderEditable('totalPrice', 'tm-pm-resource-table-col-price')
                  : null}
                {columnVisibility.baseline
                  ? renderEditable('baseline', 'tm-pm-resource-table-col-baseline')
                  : null}
                {columnVisibility.note
                  ? renderEditable('note', 'tm-pm-resource-table-col-note')
                  : null}
                <th className="tm-pm-resource-table-col-spacer" aria-hidden />
              </tr>
            </thead>
          </table>
        </div>
      </div>
    </div>
  )
}
