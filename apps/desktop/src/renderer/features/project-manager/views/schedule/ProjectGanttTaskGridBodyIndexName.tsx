import { IconChevronDown, IconChevronRight } from '../../../../components/icons'
import { resolveGanttTaskKind } from './pm-gantt-tree'
import { isGanttProjectRootId } from './pm-gantt-utils'
import type { BodyCellRenderArgs } from './ProjectGanttTaskGridBodyShared'

export function renderGanttIndexNameCell({ row, field, gridProps, state }: BodyCellRenderArgs) {
  const {
    criticalIds,
    printLayout = false,
    onToggleChecked,
    onToggleCollapse,
    checkedIds,
  } = gridProps
  const {
    t,
    editing,
    draft,
    setDraft,
    inputRef,
    commitEdit,
    handleKeyDown,
    selectionMode,
    startEdit,
    cellValue,
  } = state
  const { item, depth, hasChildren, expanded } = row
  const isEditing =
    editing?.kind === 'cell' && editing.itemId === item.id && editing.field === field
  const value = cellValue(item, field)
  const onCritical = criticalIds?.has(item.id) ?? false
  const kind = resolveGanttTaskKind(item, hasChildren, onCritical)

    if (field === 'index') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      const checked = checkedIds.has(item.id)
      const checkboxTitle = `${t('projectManagerPage.schedule.selection.checkboxColumn')} ${row.rowNumber}`
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--index"
          onClick={(event) => event.stopPropagation()}>
          {printLayout || !selectionMode || isProjectRoot ? (
            row.rowNumber > 0 ? row.rowNumber : ''
          ) : (
            <label className="tm-kb-file-card-select" title={checkboxTitle}>
              <input
                type="checkbox"
                className="tm-kb-file-card-select-input"
                checked={checked}
                aria-label={checkboxTitle}
                onChange={() => onToggleChecked(item.id)}
                onClick={(event) => event.stopPropagation()}
              />
              <span
                className={[
                  'tm-kb-file-card-select-box',
                  checked ? 'tm-kb-file-card-select-box--checked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden="true"
              />
            </label>
          )}
        </span>
      )
    }

    if (field === 'name') {
      const isProjectRoot = isGanttProjectRootId(item.id)
      return (
        <span
          key={field}
          className="tm-pm-gantt-col tm-pm-gantt-col--name"
          style={{ paddingLeft: `${4 + depth * 14}px` }}
          onDoubleClick={
            isProjectRoot
              ? undefined
              : () => startEdit({ kind: 'cell', itemId: item.id, field }, value)
          }>
          {hasChildren ? (
            <button
              type="button"
              className="tm-pm-gantt-fold-btn"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse(item.id)
              }}>
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </button>
          ) : (
            <span className="tm-pm-gantt-fold-placeholder" />
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              className="tm-pm-gantt-cell-input tm-pm-gantt-cell-input--name"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className={[
                'tm-pm-gantt-cell-text',
                kind === 'summary' || isProjectRoot ? 'tm-pm-gantt-cell-text--summary' : '',
                onCritical ? 'tm-pm-gantt-cell-text--critical' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={item.title}>
              {item.title}
            </span>
          )}
        </span>
      )
    }

    if (field === 'spacer') {
      return <span key={field} className="tm-pm-gantt-col tm-pm-gantt-col--spacer" aria-hidden />
    }
  return null
}
