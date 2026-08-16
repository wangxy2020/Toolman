import type { FC } from 'react'

import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'
import {
  renderGanttCostViewHeader,
  renderGanttResourceViewHeader,
} from './project-gantt-task-grid-header-modes'

export interface ProjectGanttTaskGridHeaderProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Column header row — plain builtin columns, or the two-row resource/cost grouped headers. */
export const ProjectGanttTaskGridHeader: FC<ProjectGanttTaskGridHeaderProps> = ({
  gridProps,
  state,
}) => {
  const { prefs, headerHeight, resourceViewMode = false, costViewMode = false } = gridProps
  const {
    t,
    editing,
    draft,
    setDraft,
    inputRef,
    commitEdit,
    handleKeyDown,
    startEdit,
    labelOf,
    openHeaderMenu,
    columnClassSuffix,
    costInputMode,
    gridTemplate,
  } = state

  const renderPlainHeaderCell = (columnId: string, options?: { rowSpan2?: boolean }) => {
    const isEditing = editing?.kind === 'header' && editing.columnId === columnId
    const editable =
      columnId !== 'index' &&
      columnId !== 'spacer' &&
      !resourceViewMode &&
      !costViewMode
    return (
      <span
        key={columnId}
        className={[
          'tm-pm-gantt-col',
          `tm-pm-gantt-col--${columnClassSuffix(columnId)}`,
          options?.rowSpan2 ? 'tm-pm-gantt-col--rowspan2' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onDoubleClick={
          editable ? () => startEdit({ kind: 'header', columnId }, labelOf(columnId)) : undefined
        }
        onContextMenu={columnId === 'spacer' ? undefined : openHeaderMenu}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-table-header-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ) : labelOf(columnId).includes('\n') ? (
          <span className="tm-pm-gantt-col-label-wrap">
            {labelOf(columnId)
              .split('\n')
              .map((line) => (
                <span key={line}>{line}</span>
              ))}
          </span>
        ) : (
          labelOf(columnId)
        )}
      </span>
    )
  }

  const modeArgs = {
    prefs,
    t,
    openHeaderMenu,
    costInputMode,
    renderPlainHeaderCell,
  }

  return (
    <div
      className={[
        'tm-pm-gantt-grid-header',
        resourceViewMode || (costViewMode && !costInputMode)
          ? 'tm-pm-gantt-grid-header--resource'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ height: headerHeight, gridTemplateColumns: gridTemplate }}>
      {resourceViewMode
        ? renderGanttResourceViewHeader(modeArgs)
        : costViewMode
          ? renderGanttCostViewHeader(modeArgs)
          : prefs.columnOrder.map((columnId) => renderPlainHeaderCell(columnId))}
    </div>
  )
}
