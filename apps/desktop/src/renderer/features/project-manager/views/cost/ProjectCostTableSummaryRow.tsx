import type { FC } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import { formatCostTotalPrice } from './pm-cost-catalog'
import { ProjectCostTableFitTotal } from './ProjectCostTableFitTotal'
import { syncFeatureDescriptionHeight } from './pm-cost-panel-utils'
import { ProjectCostTableSummaryFormulaCell } from './ProjectCostTableSummaryFormulaCell'
import { ProjectCostTableIpcSummaryCells } from './ProjectCostTableIpcCells'
import { ProjectCostTableMeteringSummaryCells } from './ProjectCostTableMeteringCells'
import { costSectionalWorkKey, costSubprojectKey } from './pm-cost-catalog-sectional'
import { sumCostIpcStatements } from './pm-cost-ipc-cols'
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
    databaseSectionCurrencies,
    selectedId,
    setSelectedId,
    patchSummaryRow,
    patchSectionMeta,
    totalFormulaFocusId,
    setTotalFormulaFocusId,
    formulaInputRef,
    appendSectionRefToActiveFormula,
    showMeteringColumns,
    showIpcStatementColumns,
    ipcColumns,
    visibleRows,
  } = state

  const isTopSummary = entry.kind === 'summary'
  const sectionKey = isTopSummary ? '' : entry.summary.key
  const sectionSubproject = isTopSummary ? '' : entry.summary.subproject
  const sectionMetaScope = { subproject: sectionSubproject }
  const sectionCurrency =
    !isTopSummary ? databaseSectionCurrencies[sectionKey] : undefined
  const sectionRowId = isTopSummary
    ? entry.row.id
    : `section:${sectionSubproject || '__empty__'}\u001f${sectionKey || '__empty__'}`
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
  const formulaFocusKey = isTopSummary ? `summary:${entry.row.id}` : sectionRowId
  const selectionId = sectionRowId
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
      key={isTopSummary ? `summary:${entry.row.id}` : `${sectionRowId}:${entryIndex}`}
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
      {columnVisibility.subproject ? (
        <td className="tm-pm-resource-table-col-subproject">
          {!isTopSummary && sectionSubproject ? (
            <span className="tm-pm-cost-table-section-summary-label">{sectionSubproject}</span>
          ) : null}
        </td>
      ) : null}
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
                  patchSectionMeta(
                    sectionKey,
                    {
                      sectionCode: event.target.value,
                    },
                    sectionMetaScope,
                  )
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
                  patchSectionMeta(
                    sectionKey,
                    {
                      sectionName: event.target.value,
                    },
                    sectionMetaScope,
                  )
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
                  patchSectionMeta(
                    sectionKey,
                    {
                      sectionFeatureDescription: event.target.value,
                    },
                    sectionMetaScope,
                  )
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
      {columnVisibility.unit ? (
        <td className="tm-pm-resource-table-col-unit">
          {sectionCurrency ? (
            <span className="tm-pm-cost-table-section-summary-currency">{sectionCurrency}</span>
          ) : null}
        </td>
      ) : null}
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
                patchSectionMeta(
                  sectionKey,
                  {
                    sectionTotalFormula: next,
                  },
                  sectionMetaScope,
                )
              }
            }}
            onSelect={() => setSelectedId(selectionId)}
            setTotalFormulaFocusId={setTotalFormulaFocusId}
            appendSectionRefToActiveFormula={appendSectionRefToActiveFormula}
          />
        ) : (
          <td className="tm-pm-resource-table-cell--center tm-pm-resource-table-col-price tm-pm-resource-table-col-total-price">
            <ProjectCostTableFitTotal
              className="tm-pm-cost-table-section-summary-total"
              value={formatCostTotalPrice(totalValue)}
            />
          </td>
        )
      ) : null}
      {showMeteringColumns ? <ProjectCostTableMeteringSummaryCells /> : null}
      {showIpcStatementColumns ? (
        <ProjectCostTableIpcSummaryCells
          ipcColumns={ipcColumns}
          statement={sumCostIpcStatements(
            isTopSummary
              ? visibleRows
              : visibleRows.filter(
                  (row) =>
                    costSectionalWorkKey(row) === sectionKey &&
                    costSubprojectKey(row) === sectionSubproject,
                ),
            ipcColumns,
            totalValue,
          )}
        />
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
                patchSectionMeta(
                  sectionKey,
                  {
                    sectionNote: event.target.value,
                  },
                  sectionMetaScope,
                )
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
