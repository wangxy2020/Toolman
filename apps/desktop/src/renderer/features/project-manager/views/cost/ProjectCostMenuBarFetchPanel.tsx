import type { FC } from 'react'
import { createPortal } from 'react-dom'

import { useI18n } from '../../../../i18n/useI18n'

export type CostFetchTarget =
  | 'priceList'
  | 'meteringTable'
  | 'progressPaymentStats'
  | 'paymentStats'

const RESERVED_FETCH_TARGETS = [
  { target: 'progressPaymentStats', labelKey: 'fetchProgressPaymentStats' },
  { target: 'paymentStats', labelKey: 'fetchPaymentStats' },
] as const

export interface ProjectCostMenuBarFetchPanelProps {
  pos: { top: number; left: number } | null
  fetching?: boolean
  onSelect: (target: CostFetchTarget) => void
}

/** Dropdown for「获取」: 价格表 / 中期计量表 query the mapped local tables; stats stay reserved. */
export const ProjectCostMenuBarFetchPanel: FC<ProjectCostMenuBarFetchPanelProps> = ({
  pos,
  fetching = false,
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
        role="menuitem"
        aria-disabled={fetching}
        className={[
          'tm-pm-gantt-view-option',
          fetching ? 'tm-pm-gantt-view-option--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (fetching) return
          onSelect('priceList')
        }}
      >
        {t('projectManagerPage.costTable.menu.fetchPriceList')}
      </button>
      <button
        type="button"
        role="menuitem"
        aria-disabled={fetching}
        className={[
          'tm-pm-gantt-view-option',
          fetching ? 'tm-pm-gantt-view-option--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (fetching) return
          onSelect('meteringTable')
        }}
      >
        {t('projectManagerPage.costTable.menu.fetchMeteringTable')}
      </button>
      {RESERVED_FETCH_TARGETS.map(({ target, labelKey }) => (
        <button
          key={target}
          type="button"
          role="menuitem"
          aria-disabled="true"
          title={t('projectManagerPage.costTable.menu.fetchMeteringTableReserved')}
          className="tm-pm-gantt-view-option tm-pm-gantt-view-option--disabled"
          onClick={(event) => event.preventDefault()}
        >
          {t(`projectManagerPage.costTable.menu.${labelKey}`)}
        </button>
      ))}
    </div>,
    document.body,
  )
}
