import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { buildDefaultResourceColumnBindings, GANTT_BUILTIN_COLUMNS } from './pm-gantt-prefs'
import type { Props } from './pm-gantt-task-grid-utils'
import type { GanttTaskGridState } from './useProjectGanttTaskGrid'

export interface ProjectGanttColumnMenuPopupProps {
  gridProps: Props
  state: GanttTaskGridState
}

/** Column-visibility menu: builtin columns / resource-view slots / cost-view slots. */
export const ProjectGanttColumnMenuPopup: FC<ProjectGanttColumnMenuPopupProps> = ({
  gridProps,
  state,
}) => {
  const { prefs, resourceViewMode = false, costViewMode = false } = gridProps
  const {
    t,
    contextMenu,
    setContextMenu,
    menuLabelOf,
    columnBindings,
    patchPrefs,
    toggleColumnVisible,
    addCustomColumn,
  } = state

  if (!contextMenu) return null

  return createPortal(
    <div
      className="tm-pm-gantt-col-menu"
      style={{ right: contextMenu.right, top: contextMenu.top }}
      onMouseDown={(event) => event.stopPropagation()}>
      {resourceViewMode ? (
        <>
          <div className="tm-pm-gantt-col-menu-title">
            {t('projectManagerPage.schedule.columnVisibility')}
          </div>
          {(
            [
              ['duration', 'showDuration'],
              ['start', 'showStart'],
              ['finish', 'showFinish'],
            ] as const
          ).map(([key, prefKey]) => (
            <label key={key} className="tm-pm-gantt-col-menu-item">
              <input
                type="checkbox"
                checked={prefs.resourceView[prefKey]}
                onChange={() => {
                  patchPrefs({
                    resourceView: {
                      ...prefs.resourceView,
                      [prefKey]: !prefs.resourceView[prefKey],
                    },
                  })
                }}
              />
              <span>{menuLabelOf(key)}</span>
            </label>
          ))}
          <label className="tm-pm-gantt-col-menu-item">
            <input
              type="checkbox"
              checked={prefs.resourceView.inputMode}
              onChange={() => {
                patchPrefs({
                  resourceView: {
                    ...prefs.resourceView,
                    inputMode: !prefs.resourceView.inputMode,
                  },
                })
              }}
            />
            <span>{t('projectManagerPage.schedule.resourceInputMode')}</span>
          </label>
          <button
            type="button"
            className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
            onClick={() => {
              const nextCount = prefs.resourceView.slotCount + 1
              const nextBindings = buildDefaultResourceColumnBindings(nextCount).map(
                (binding, index) => columnBindings[index] ?? binding,
              )
              patchPrefs({
                resourceView: {
                  ...prefs.resourceView,
                  slotCount: nextCount,
                  columnBindings: nextBindings,
                },
              })
              setContextMenu(null)
            }}
          >
            {t('projectManagerPage.schedule.addResourceColumns')}
          </button>
          <button
            type="button"
            className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
            disabled={prefs.resourceView.slotCount <= 1}
            onClick={() => {
              if (prefs.resourceView.slotCount <= 1) return
              const nextCount = Math.max(1, prefs.resourceView.slotCount - 1)
              patchPrefs({
                resourceView: {
                  ...prefs.resourceView,
                  slotCount: nextCount,
                  columnBindings: columnBindings.slice(0, nextCount),
                },
              })
              setContextMenu(null)
            }}
          >
            {t('projectManagerPage.schedule.removeResourceColumns')}
          </button>
        </>
      ) : costViewMode ? (
        <>
          <div className="tm-pm-gantt-col-menu-title">
            {t('projectManagerPage.schedule.columnVisibility')}
          </div>
          {(
            [
              ['duration', 'showDuration'],
              ['start', 'showStart'],
              ['finish', 'showFinish'],
            ] as const
          ).map(([key, prefKey]) => (
            <label key={key} className="tm-pm-gantt-col-menu-item">
              <input
                type="checkbox"
                checked={prefs.costView[prefKey]}
                onChange={() => {
                  patchPrefs({
                    costView: {
                      ...prefs.costView,
                      [prefKey]: !prefs.costView[prefKey],
                    },
                  })
                }}
              />
              <span>{menuLabelOf(key)}</span>
            </label>
          ))}
          <label className="tm-pm-gantt-col-menu-item">
            <input
              type="checkbox"
              checked={prefs.costView.inputMode}
              onChange={() => {
                patchPrefs({
                  costView: {
                    ...prefs.costView,
                    inputMode: !prefs.costView.inputMode,
                  },
                })
              }}
            />
            <span>{t('projectManagerPage.schedule.costInputMode')}</span>
          </label>
          {!prefs.costView.inputMode ? (
            <>
              <button
                type="button"
                className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                onClick={() => {
                  patchPrefs({
                    costView: {
                      ...prefs.costView,
                      slotCount: prefs.costView.slotCount + 1,
                    },
                  })
                  setContextMenu(null)
                }}
              >
                {t('projectManagerPage.schedule.addCostColumns')}
              </button>
              {prefs.costView.slotCount > 1 ? (
                <button
                  type="button"
                  className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
                  onClick={() => {
                    patchPrefs({
                      costView: {
                        ...prefs.costView,
                        slotCount: Math.max(1, prefs.costView.slotCount - 1),
                      },
                    })
                    setContextMenu(null)
                  }}
                >
                  {t('projectManagerPage.schedule.removeCostColumns')}
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="tm-pm-gantt-col-menu-title">
            {t('projectManagerPage.schedule.columnVisibility')}
          </div>
          {GANTT_BUILTIN_COLUMNS.map((key) => {
            const checked = prefs.columnOrder.includes(key)
            const locked = key === 'name'
            return (
              <label key={key} className="tm-pm-gantt-col-menu-item">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggleColumnVisible(key)}
                />
                <span>{menuLabelOf(key)}</span>
              </label>
            )
          })}
          {prefs.customColumns.map((col) => {
            const checked = prefs.columnOrder.includes(col.id)
            return (
              <label key={col.id} className="tm-pm-gantt-col-menu-item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleColumnVisible(col.id)}
                />
                <span>{menuLabelOf(col.id)}</span>
              </label>
            )
          })}
          <button
            type="button"
            className="tm-pm-gantt-col-menu-item tm-pm-gantt-col-menu-action"
            onClick={addCustomColumn}>
            {t('projectManagerPage.schedule.addCustomColumn')}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
