import type { Dispatch, RefObject, SetStateAction } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import {
  COST_PRACTICE_QUOTA_VIEWS,
  RESOURCE_PRACTICE_QUOTA_VIEWS,
  type CostPracticeQuotaView,
  type FeaturesScheduleView,
  type ResourcePracticeQuotaView,
} from './ProjectFeaturesMenuBarTypes'

type Props = {
  disabled: boolean
  viewRef: RefObject<HTMLSpanElement | null>
  viewOpen: boolean
  setViewOpen: Dispatch<SetStateAction<boolean>>
  viewPos: { top: number; left: number } | null
  viewLabel: string
  viewCurrentLabel: string
  viewMenuMode: 'schedule' | 'resourceQuota' | 'costQuota'
  scheduleView: FeaturesScheduleView
  onScheduleViewChange?: (view: FeaturesScheduleView) => void
  quotaView: ResourcePracticeQuotaView
  onQuotaViewChange?: (view: ResourcePracticeQuotaView) => void
  costQuotaView: CostPracticeQuotaView
  onCostQuotaViewChange?: (view: CostPracticeQuotaView) => void
  viewLabelByMode: Record<FeaturesScheduleView, string>
  quotaLabelByMode: Record<ResourcePracticeQuotaView, string>
  costQuotaLabelByMode: Record<CostPracticeQuotaView, string>
  hideTip: () => void
  tipProps: (text: string) => Record<string, unknown>
  closeSiblingMenus: () => void
}

export function ProjectFeaturesMenuBarViewPanel({
  disabled,
  viewRef,
  viewOpen,
  setViewOpen,
  viewPos,
  viewLabel,
  viewCurrentLabel,
  viewMenuMode,
  scheduleView,
  onScheduleViewChange,
  quotaView,
  onQuotaViewChange,
  costQuotaView,
  onCostQuotaViewChange,
  viewLabelByMode,
  quotaLabelByMode,
  costQuotaLabelByMode,
  hideTip,
  tipProps,
  closeSiblingMenus,
}: Props) {
  return (
    <span className="tm-pm-features-menubar-item tm-pm-gantt-view-menu" ref={viewRef}>
      <button
        type="button"
        className="tm-pm-features-menubar-btn"
        aria-label={viewLabel}
        aria-disabled={disabled}
        aria-expanded={viewOpen}
        onClick={() => {
          if (disabled) return
          hideTip()
          closeSiblingMenus()
          setViewOpen((open) => !open)
        }}
        {...tipProps(viewLabel)}
      >
        <span>{viewLabel}</span>
        <span className="tm-pm-gantt-view-current">{viewCurrentLabel}</span>
        <IconChevronDown size={14} />
      </button>
      {viewOpen && viewPos
        ? createPortal(
            <div
              className="tm-pm-gantt-view-panel"
              role="menu"
              style={{ top: viewPos.top, left: viewPos.left }}
            >
              {viewMenuMode === 'resourceQuota'
                ? RESOURCE_PRACTICE_QUOTA_VIEWS.map((view) => (
                    <button
                      key={view}
                      type="button"
                      role="menuitemradio"
                      aria-checked={quotaView === view}
                      className={[
                        'tm-pm-gantt-view-option',
                        quotaView === view ? 'tm-pm-gantt-view-option--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => {
                        onQuotaViewChange?.(view)
                        setViewOpen(false)
                      }}
                    >
                      {quotaLabelByMode[view]}
                    </button>
                  ))
                : viewMenuMode === 'costQuota'
                  ? COST_PRACTICE_QUOTA_VIEWS.map((view) => (
                      <button
                        key={view}
                        type="button"
                        role="menuitemradio"
                        aria-checked={costQuotaView === view}
                        className={[
                          'tm-pm-gantt-view-option',
                          costQuotaView === view ? 'tm-pm-gantt-view-option--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          onCostQuotaViewChange?.(view)
                          setViewOpen(false)
                        }}
                      >
                        {costQuotaLabelByMode[view]}
                      </button>
                    ))
                  : (['list', 'gantt', 'progressCheck', 'resource', 'cost'] as const).map(
                      (view) => (
                        <button
                          key={view}
                          type="button"
                          role="menuitemradio"
                          aria-checked={scheduleView === view}
                          className={[
                            'tm-pm-gantt-view-option',
                            scheduleView === view ? 'tm-pm-gantt-view-option--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            onScheduleViewChange?.(view)
                            setViewOpen(false)
                          }}
                        >
                          {viewLabelByMode[view]}
                        </button>
                      ),
                    )}
            </div>,
            document.body,
          )
        : null}
      <span className="tm-pm-features-menubar-divider" />
    </span>
  )
}
