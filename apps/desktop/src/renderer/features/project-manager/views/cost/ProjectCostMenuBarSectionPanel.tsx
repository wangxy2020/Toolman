import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { useI18n } from '../../../../i18n/useI18n'
import { COST_SECTION_FILTER_SUMMARY, isCostSectionSummaryFilter } from './pm-cost-catalog'

export interface ProjectCostMenuBarSectionPanelProps {
  pos: { top: number; left: number } | null
  sectionFilter: string
  sectionalOptions: readonly string[]
  sectionOptionLabel: (key: string) => string
  onSelect: (filter: string) => void
}

/** 分部工程 filter dropdown for the「分部」menu item. */
export const ProjectCostMenuBarSectionPanel: FC<ProjectCostMenuBarSectionPanelProps> = ({
  pos,
  sectionFilter,
  sectionalOptions,
  sectionOptionLabel,
  onSelect,
}) => {
  const { t } = useI18n()
  if (!pos) return null
  return createPortal(
    <div
      className="tm-pm-gantt-view-panel tm-pm-gantt-type-panel"
      role="menu"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={sectionFilter === 'all'}
        className={[
          'tm-pm-gantt-view-option',
          sectionFilter === 'all' ? 'tm-pm-gantt-view-option--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect('all')}
      >
        {t('projectManagerPage.costTable.views.allSections')}
      </button>
      {sectionalOptions.length === 0 ? (
        <div className="tm-pm-gantt-submenu-empty">—</div>
      ) : (
        sectionalOptions.map((section) => (
          <button
            key={section || '__empty__'}
            type="button"
            role="menuitemradio"
            aria-checked={sectionFilter === section}
            className={[
              'tm-pm-gantt-view-option',
              sectionFilter === section ? 'tm-pm-gantt-view-option--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={sectionOptionLabel(section)}
            onClick={() => onSelect(section)}
          >
            {sectionOptionLabel(section)}
          </button>
        ))
      )}
      <button
        type="button"
        role="menuitemradio"
        aria-checked={isCostSectionSummaryFilter(sectionFilter)}
        className={[
          'tm-pm-gantt-view-option',
          isCostSectionSummaryFilter(sectionFilter) ? 'tm-pm-gantt-view-option--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect(COST_SECTION_FILTER_SUMMARY)}
      >
        {t('projectManagerPage.costTable.views.sectionSummary')}
      </button>
    </div>,
    document.body,
  )
}
