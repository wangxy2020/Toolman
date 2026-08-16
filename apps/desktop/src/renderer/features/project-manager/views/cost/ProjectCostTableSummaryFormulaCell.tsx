import type { FC, RefObject } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { formatCostTotalPrice } from './pm-cost-catalog'

export const ProjectCostTableSummaryFormulaCell: FC<{
  focusKey: string
  formula: string
  total: number | null
  focused: boolean
  canPick: boolean
  pickRefName?: string | null
  formulaInputRef: RefObject<HTMLInputElement | null>
  onFormulaChange: (next: string) => void
  onSelect?: () => void
  setTotalFormulaFocusId: (
    updater: string | null | ((current: string | null) => string | null),
  ) => void
  appendSectionRefToActiveFormula: (name: string) => void
}> = ({
  focusKey,
  formula,
  total,
  focused,
  canPick,
  pickRefName,
  formulaInputRef,
  onFormulaChange,
  onSelect,
  setTotalFormulaFocusId,
  appendSectionRefToActiveFormula,
}) => {
  const { t } = useI18n()
  const trimmed = formula.trim() === '=' ? '' : formula.trim()
  return (
    <td
      className={[
        'tm-pm-resource-table-cell--center',
        'tm-pm-resource-table-col-price',
        canPick ? 'tm-pm-cost-table-summary-formula-pickable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={(event) => {
        if (canPick && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
        }
      }}
      onClick={(event) => {
        if (canPick && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.stopPropagation()
          appendSectionRefToActiveFormula(pickRefName!.trim())
        }
      }}
    >
      <input
        ref={focused ? formulaInputRef : undefined}
        className="tm-pm-resource-table-input tm-pm-resource-table-input--center tm-pm-cost-table-section-summary-input tm-pm-cost-table-summary-formula"
        value={focused ? formula.trim() || '=' : formatCostTotalPrice(total)}
        placeholder={t('projectManagerPage.costTable.totalFormulaPlaceholder')}
        title={
          canPick
            ? t('projectManagerPage.costTable.totalFormulaPickHint')
            : trimmed
              ? t('projectManagerPage.costTable.totalFormulaTitleWithResult', {
                  formula: trimmed,
                  result: formatCostTotalPrice(total),
                })
              : t('projectManagerPage.costTable.totalFormulaHint')
        }
        onFocus={() => {
          onSelect?.()
          setTotalFormulaFocusId(focusKey)
        }}
        onBlur={() => {
          setTotalFormulaFocusId((current) => (current === focusKey ? null : current))
          if (formula.trim() === '=') onFormulaChange('')
        }}
        onChange={(event) => onFormulaChange(event.target.value)}
        onMouseDown={(event) => {
          if (canPick && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
          }
        }}
        onClick={(event) => {
          if (canPick && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            event.stopPropagation()
            appendSectionRefToActiveFormula(pickRefName!.trim())
            return
          }
          event.stopPropagation()
        }}
      />
    </td>
  )
}
