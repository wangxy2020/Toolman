import type { FC } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { formatCostTotalPrice } from './pm-cost-catalog'
import { syncFeatureDescriptionHeight } from './pm-cost-panel-utils'
import { ProjectCostTableSummaryFormulaCell } from './ProjectCostTableSummaryFormulaCell'
import type { ProjectCostTablePanelState } from './useProjectCostTablePanel'

type CostDisplayEntry = ProjectCostTablePanelState['displayEntries'][number]

export interface ProjectCostTableSummaryRowProps {
  entry: Extract<CostDisplayEntry, { kind: 'summary' | 'section' }>
  entryIndex: number
  state: ProjectCostTablePanelState
}

/** One 汇总 (grand total) or 分部工程 section-total row: editable when the rollup view is active. */
export const ProjectCostTableSummaryRow: FC<ProjectCostTableSummaryRowProps> = ({
  entry,
  entryIndex,
  state,
}) => {
  const { t } = useI18n()
  const {
    columnVisibility,
    isSummaryView,
    selectedId,
    setSelectedId,
    patchSummaryRow,
    patchSectionMeta,
    totalFormulaFocusId,
    setTotalFormulaFocusId,
    formulaInputRef,
    appendSectionRefToActiveFormula,
  } = state

  const isTopSummary = entry.kind === 'summary'
  const sectionKey = isTopSummary ? '' : entry.summary.key
  const sectionLabel = isTopSummary
    ? entry.row.name.trim() || t('projectManagerPage.costTable.views.sectionSummary')
    : entry.summary.key
      ? entry.summary.key
      : t('projectManagerPage.costTable.views.sectionEmpty')
  const codeValue = isTopSummary ? entry.row.code : entry.summary.code
  const nameValue = isTopSummary
    ? entry.row.name
    : isSummaryView && 'name' in entry.summary
      ? entry.summary.name
      : sectionLabel
  const featureValue = isTopSummary
    ? entry.row.featureDescription
    : 'featureDescription' in entry.summary
      ? entry.summary.featureDescription
      : ''
  const noteValue = isTopSummary ? '' : entry.summary.note
  const totalValue = isTopSummary ? entry.total : entry.summary.total
  const formulaValue = isTopSummary
    ? entry.row.totalFormula
    : 'totalFormula' in entry.summary
      ? entry.summary.totalFormula
      : ''
  const formulaFocusKey = isTopSummary
    ? `summary:${entry.row.id}`
    : `section:${sectionKey || '__empty__'}`
  const selectionId = isTopSummary ? entry.row.id : `section:${sectionKey || '__empty__'}`
  const isRowSelected = selectedId === selectionId
  const pickRefName = isTopSummary
    ? null
    : nameValue.trim() || codeValue.trim() || sectionKey.trim() || null
  const canPickFormula =
    isSummaryView &&
    totalFormulaFocusId != null &&
    totalFormulaFocusId !== formulaFocusKey &&
    Boolean(pickRefName?.trim())

  return (
    <tr
      key={isTopSummary ? `summary:${entry.row.id}` : `section:${entryIndex}:${sectionKey || '__empty__'}`}
      className={[
        'tm-pm-cost-table-section-summary',
        isTopSummary ? 'tm-pm-cost-table-section-summary--grand' : '',
        isRowSelected ? 'tm-pm-resource-table-row--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setSelectedId(selectionId)}
    >
      <td className="tm-pm-resource-table-index">
        <span className="tm-pm-resource-table-index-text" aria-hidden>
          {' '}
        </span>
      </td>
      {columnVisibility.type ? <td /> : null}
      {columnVisibility.sectionalWork ? (
        <td className="tm-pm-resource-table-col-sectional">
          <span className="tm-pm-cost-table-section-summary-label">
            {isTopSummary
              ? entry.row.name.trim() || t('projectManagerPage.costTable.views.sectionSummary')
              : sectionLabel}
          </span>
        </td>
      ) : null}
      {columnVisibility.code ? (
        <td className="tm-pm-resource-table-col-code">
          {isSummaryView || !isTopSummary ? (
            <input
              className="tm-pm-resource-table-input tm-pm-resource-table-input--center tm-pm-cost-table-section-summary-input"
              value={codeValue}
              placeholder={t('projectManagerPage.costTable.codePlaceholder')}
              onChange={(event) => {
                if (isTopSummary) {
                  patchSummaryRow(entry.row.id, {
                    code: event.target.value,
                  })
                } else {
                  patchSectionMeta(sectionKey, {
                    sectionCode: event.target.value,
                  })
                }
              }}
              onFocus={() => setSelectedId(selectionId)}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
        </td>
      ) : null}
      {columnVisibility.name ? (
        <td>
          {isSummaryView ? (
            <input
              className="tm-pm-resource-table-input tm-pm-cost-table-section-summary-input"
              value={nameValue}
              placeholder={t('projectManagerPage.costTable.namePlaceholder')}
              onChange={(event) => {
                if (isTopSummary) {
                  patchSummaryRow(entry.row.id, {
                    name: event.target.value,
                  })
                } else {
                  patchSectionMeta(sectionKey, {
                    sectionName: event.target.value,
                  })
                }
              }}
              onFocus={() => setSelectedId(selectionId)}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="tm-pm-cost-table-section-summary-label">
              {sectionLabel}
              {!columnVisibility.totalPrice ? ` ${formatCostTotalPrice(totalValue)}` : ''}
            </span>
          )}
        </td>
      ) : null}
      {columnVisibility.featureDescription ? (
        <td>
          {isSummaryView ? (
            <textarea
              className="tm-pm-resource-table-input tm-pm-resource-table-input--feature tm-pm-cost-table-section-summary-input"
              value={featureValue}
              placeholder={t('projectManagerPage.costTable.featureDescriptionPlaceholder')}
              rows={1}
              onChange={(event) => {
                if (isTopSummary) {
                  patchSummaryRow(entry.row.id, {
                    featureDescription: event.target.value,
                  })
                } else {
                  patchSectionMeta(sectionKey, {
                    sectionFeatureDescription: event.target.value,
                  })
                }
              }}
              onInput={(event) => syncFeatureDescriptionHeight(event.currentTarget)}
              ref={(node) => {
                if (node) syncFeatureDescriptionHeight(node)
              }}
              onFocus={() => setSelectedId(selectionId)}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
        </td>
      ) : null}
      {columnVisibility.unit ? <td /> : null}
      {columnVisibility.quantity ? <td /> : null}
      {columnVisibility.unitPrice ? <td /> : null}
      {columnVisibility.totalPrice ? (
        isSummaryView ? (
          <ProjectCostTableSummaryFormulaCell
            focusKey={formulaFocusKey}
            formula={formulaValue}
            total={totalValue}
            focused={totalFormulaFocusId === formulaFocusKey}
            canPick={canPickFormula}
            pickRefName={pickRefName}
            formulaInputRef={formulaInputRef}
            onFormulaChange={(next) => {
              if (isTopSummary) {
                patchSummaryRow(entry.row.id, { totalFormula: next })
              } else {
                patchSectionMeta(sectionKey, {
                  sectionTotalFormula: next,
                })
              }
            }}
            onSelect={() => setSelectedId(selectionId)}
            setTotalFormulaFocusId={setTotalFormulaFocusId}
            appendSectionRefToActiveFormula={appendSectionRefToActiveFormula}
          />
        ) : (
          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price">
            <span className="tm-pm-cost-table-section-summary-total">
              {formatCostTotalPrice(totalValue)}
            </span>
          </td>
        )
      ) : null}
      {columnVisibility.baseline ? <td /> : null}
      {columnVisibility.note ? (
        <td>
          {isTopSummary ? null : (
            <input
              className="tm-pm-resource-table-input tm-pm-cost-table-section-summary-input"
              value={noteValue}
              placeholder={t('projectManagerPage.costTable.notePlaceholder')}
              onChange={(event) =>
                patchSectionMeta(sectionKey, {
                  sectionNote: event.target.value,
                })
              }
              onFocus={() => setSelectedId(selectionId)}
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </td>
      ) : null}
      <td className="tm-pm-resource-table-col-spacer" aria-hidden />
    </tr>
  )
}
