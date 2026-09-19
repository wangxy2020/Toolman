import type { Dispatch, RefObject, SetStateAction } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import { ProjectCostRowFilterOptions } from '../cost/ProjectCostRowFilterOptions'
import type { FeaturesDatabaseRowFilter } from './ProjectFeaturesMenuBarTypes'

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string
  disabled: boolean
  hasProject: boolean
  baselineRef: RefObject<HTMLSpanElement | null>
  baselineOpen: boolean
  setBaselineOpen: Dispatch<SetStateAction<boolean>>
  baselinePos: { top: number; left: number } | null
  filterMenuLabel: string
  databaseRowFilter: FeaturesDatabaseRowFilter
  onDatabaseRowFilterChange?: (filter: FeaturesDatabaseRowFilter) => void
  databaseSubprojectOptions: string[]
  databaseSectionalOptions: string[]
  hideTip: () => void
  tipProps: (text: string) => Record<string, unknown>
  closeSiblingMenus: () => void
}

export function ProjectFeaturesMenuBarFilterPanel({
  t,
  disabled,
  hasProject,
  baselineRef,
  baselineOpen,
  setBaselineOpen,
  baselinePos,
  filterMenuLabel,
  databaseRowFilter,
  onDatabaseRowFilterChange,
  databaseSubprojectOptions,
  databaseSectionalOptions,
  hideTip,
  tipProps,
  closeSiblingMenus,
}: Props) {
  return (
    <span className="tm-pm-features-menubar-item tm-pm-gantt-view-menu" ref={baselineRef}>
      <button
        type="button"
        className="tm-pm-features-menubar-btn"
        aria-label={filterMenuLabel}
        aria-disabled={disabled || !hasProject}
        aria-expanded={baselineOpen}
        onClick={() => {
          if (disabled || !hasProject) return
          hideTip()
          closeSiblingMenus()
          setBaselineOpen((open) => !open)
        }}
        {...tipProps(filterMenuLabel)}
      >
        <span>{filterMenuLabel}</span>
        <IconChevronDown size={14} />
      </button>
      {baselineOpen && baselinePos
        ? createPortal(
            <div
              className="tm-pm-gantt-view-panel"
              role="menu"
              style={{ top: baselinePos.top, left: baselinePos.left }}
            >
              <ProjectCostRowFilterOptions
                t={t}
                filter={databaseRowFilter}
                subprojectOptions={databaseSubprojectOptions}
                sectionalOptions={databaseSectionalOptions}
                onChange={(filter) => onDatabaseRowFilterChange?.(filter)}
              />
            </div>,
            document.body,
          )
        : null}
      <span className="tm-pm-features-menubar-divider" />
    </span>
  )
}
