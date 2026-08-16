import type { Dispatch, RefObject, SetStateAction } from 'react'
import { createPortal } from 'react-dom'

import { IconCheck, IconChevronDown } from '../../../../components/icons'
import {
  FEATURES_RESOURCE_STAT_FILTERS,
  type FeaturesMenuAction,
  type FeaturesResourceStatFilter,
} from './ProjectFeaturesMenuBarTypes'

type Props = {
  t: (key: string) => string
  disabled: boolean
  resourceStatsRef: RefObject<HTMLSpanElement | null>
  resourceStatsOpen: boolean
  setResourceStatsOpen: Dispatch<SetStateAction<boolean>>
  resourceStatsPos: { top: number; left: number } | null
  resourceStatsMenuLabel: string
  resourceStatMode: boolean
  resourceStatCurrent: FeaturesResourceStatFilter | null
  onAction: (action: FeaturesMenuAction) => void
  hideTip: () => void
  tipProps: (text: string) => Record<string, unknown>
  closeSiblingMenus: () => void
}

export function ProjectFeaturesMenuBarResourceStatsPanel({
  t,
  disabled,
  resourceStatsRef,
  resourceStatsOpen,
  setResourceStatsOpen,
  resourceStatsPos,
  resourceStatsMenuLabel,
  resourceStatMode,
  resourceStatCurrent,
  onAction,
  hideTip,
  tipProps,
  closeSiblingMenus,
}: Props) {
  return (
    <span
      className="tm-pm-features-menubar-item tm-pm-gantt-view-menu tm-pm-features-resource-stats-menu"
      ref={resourceStatsRef}
    >
      <button
        type="button"
        className={[
          'tm-pm-features-menubar-btn',
          resourceStatMode ? 'tm-pm-features-menubar-btn--active' : '',
          resourceStatsOpen ? 'tm-pm-features-menubar-btn--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={resourceStatsMenuLabel}
        aria-disabled={disabled}
        aria-expanded={resourceStatsOpen}
        aria-haspopup="menu"
        onClick={() => {
          if (disabled) return
          hideTip()
          closeSiblingMenus()
          setResourceStatsOpen((open) => !open)
        }}
        {...tipProps(resourceStatsMenuLabel)}
      >
        <span>{resourceStatsMenuLabel}</span>
        <IconChevronDown
          size={14}
          className={[
            'tm-pm-features-resource-stats-chevron',
            resourceStatsOpen ? 'tm-pm-features-resource-stats-chevron--open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </button>
      {resourceStatsOpen && resourceStatsPos
        ? createPortal(
            <div
              className="tm-pm-gantt-view-panel tm-pm-features-resource-stats-panel"
              role="menu"
              aria-label={resourceStatsMenuLabel}
              style={{ top: resourceStatsPos.top, left: resourceStatsPos.left }}
            >
              {FEATURES_RESOURCE_STAT_FILTERS.map((filter) => {
                const checked = resourceStatCurrent === filter
                const label =
                  filter === 'scheduleAll'
                    ? t('projectManagerPage.files.menu.scheduleAll')
                    : t(`projectManagerPage.files.menu.${filter}`)
                return (
                  <button
                    key={filter}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    className={[
                      'tm-pm-gantt-view-option',
                      'tm-pm-gantt-view-option--checkable',
                      checked ? 'tm-pm-gantt-view-option--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      onAction(filter)
                      setResourceStatsOpen(false)
                    }}
                  >
                    <span className="tm-pm-gantt-view-option-label">{label}</span>
                    <span className="tm-pm-gantt-view-option-check" aria-hidden="true">
                      {checked ? <IconCheck size={14} /> : null}
                    </span>
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
