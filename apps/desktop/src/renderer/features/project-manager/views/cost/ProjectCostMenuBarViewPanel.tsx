import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { IconChevronDown } from '../../../../components/icons'
import { useI18n } from '../../../../i18n/useI18n'
import { PM_COST_PRIMARY_TYPES } from './pm-cost-catalog'
import type { CostViewFilter } from './ProjectCostMenuBar'

export interface ProjectCostMenuBarViewPanelProps {
  pos: { top: number; left: number } | null
  viewFilter: CostViewFilter
  onSelect: (filter: CostViewFilter) => void
}

/** Cost-type filter dropdown for the「视图」menu item. */
export const ProjectCostMenuBarViewPanel: FC<ProjectCostMenuBarViewPanelProps> = ({
  pos,
  viewFilter,
  onSelect,
}) => {
  const { t } = useI18n()
  if (!pos) return null
  return createPortal(
    <div
      className="tm-pm-gantt-view-panel tm-pm-resource-view-panel"
      role="menu"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={viewFilter === 'all'}
        className={[
          'tm-pm-gantt-view-option',
          viewFilter === 'all' ? 'tm-pm-gantt-view-option--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onSelect('all')}
      >
        {t('projectManagerPage.costTable.views.allTypes')}
      </button>
      {PM_COST_PRIMARY_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="menuitemradio"
          aria-checked={viewFilter === type}
          className={[
            'tm-pm-gantt-view-option',
            viewFilter === type ? 'tm-pm-gantt-view-option--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSelect(type)}
        >
          {t(`projectManagerPage.costTable.types.${type}`)}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        aria-disabled="true"
        title={t('projectManagerPage.costTable.views.resourceCostsReserved')}
        className={[
          'tm-pm-gantt-view-option',
          'tm-pm-gantt-view-option--group',
          'tm-pm-gantt-view-option--disabled',
        ].join(' ')}
        onClick={(event) => event.preventDefault()}
      >
        <span>{t('projectManagerPage.costTable.views.resourceCosts')}</span>
        <IconChevronDown size={14} className="tm-pm-gantt-view-option-chevron" />
      </button>
    </div>,
    document.body,
  )
}
