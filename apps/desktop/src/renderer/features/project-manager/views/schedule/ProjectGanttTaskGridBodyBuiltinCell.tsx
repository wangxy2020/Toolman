import { computeScheduleVarianceDays, isGanttProjectRootId } from './pm-gantt-utils'
import type { BodyCellRenderArgs } from './ProjectGanttTaskGridBodyShared'

export function renderGanttBuiltinCell({ row, field, gridProps, state }: BodyCellRenderArgs) {
  const { item, hasChildren } = row
  const {
    progressPercentById,
    shouldPercentAsOfMs = null,
    baselinePlanByItemId,
  } = gridProps
  const {
    editing,
    draft,
    setDraft,
    inputRef,
    commitEdit,
    handleKeyDown,
    startEdit,
    cellValue,
    columnClassSuffix,
  } = state
  const isEditing =
    editing?.kind === 'cell' && editing.itemId === item.id && editing.field === field
  const value = cellValue(item, field)
  const isProjectRoot = isGanttProjectRootId(item.id)
    const varianceTone =
      field === 'variance'
        ? (() => {
            const plan = baselinePlanByItemId?.get(item.id)
            const rolledProgress = progressPercentById?.get(item.id)
            const result = computeScheduleVarianceDays(
              rolledProgress == null ? item : { ...item, progressPercent: rolledProgress },
              {
                planStartMs: plan?.startDate,
                planFinishMs: plan?.dueDate,
                shouldPercentAsOfMs,
              },
            )
            if (!result || result.days === 0) return ''
            return result.days > 0 ? 'tm-pm-gantt-col--variance-ahead' : 'tm-pm-gantt-col--variance-behind'
          })()
        : ''
    return (
      <span
        key={field}
        className={[
          'tm-pm-gantt-col',
          `tm-pm-gantt-col--${columnClassSuffix(field)}`,
          varianceTone,
        ]
          .filter(Boolean)
          .join(' ')}
        onDoubleClick={(event) => {
          if (isProjectRoot) return
          if (field === 'variance') return
          if (field === 'percentComplete' && hasChildren) return
          // 应完成% is derived from the selected baseline as-of date while comparing.
          if (field === 'shouldPercentComplete' && shouldPercentAsOfMs != null) return
          event.stopPropagation()
          startEdit({ kind: 'cell', itemId: item.id, field }, value)
        }}>
        {isEditing ? (
          <input
            ref={inputRef}
            className="tm-pm-gantt-cell-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          value || '—'
        )}
      </span>
    )
}
