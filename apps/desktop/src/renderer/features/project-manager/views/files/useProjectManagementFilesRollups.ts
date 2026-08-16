import { useCallback, useMemo } from 'react'
import type { PmWorkItem } from '@toolman/shared'
import { useI18n } from '../../../../i18n/useI18n'
import { isFeaturesResourceStatFilter } from './ProjectFeaturesMenuBar'
import {
  buildCostCatalogOrderIndex,
  buildFundsDisplayEntries,
  buildFundsSectionMetaByRowId,
  collectRollupMonthKeys,
  computeFeatureCostRollups,
  computeFeatureGanttRollups,
  computeFeatureNodeRollups,
  groupMonthKeysByYear,
  usesPeakConcurrentRollup,
  usesNonStackingPeakRollup,
  type GanttCostSeed,
  type GanttNodeSeed,
} from './pm-feature-gantt-rollup'
import {
  type PmFeatureRow,
  type PmFeatureViewFilter,
} from './pm-features-catalog'
import { resolveProjectCostCatalog } from '../cost/pm-cost-catalog'
import { computeFundsTotals, computeResourceStatTotals, computeVisibleRows } from './pm-features-panel-utils'
import type { CostColumnVisibility } from '../cost/pm-cost-column-prefs'
import type { FeaturesColumnVisibility } from './pm-features-column-prefs'
import { DEFAULT_COST_CURRENCY } from '../cost/pm-cost-currency'

export function useProjectManagementFilesRollups(args: {
  workItems: PmWorkItem[]
  rows: PmFeatureRow[]
  viewFilter: PmFeatureViewFilter
  costCatalog: ReturnType<typeof resolveProjectCostCatalog>['rows']
  costSeeds: readonly GanttCostSeed[]
  nodeSeeds: readonly GanttNodeSeed[]
  columnVisibility: FeaturesColumnVisibility
  meteringColumnVisibility: CostColumnVisibility
  lockedViewFilter?: PmFeatureViewFilter
  embedded: boolean
  t: ReturnType<typeof useI18n>['t']
}) {
  const {
    workItems, rows, viewFilter, costCatalog, costSeeds, nodeSeeds, columnVisibility,
    meteringColumnVisibility, lockedViewFilter, embedded, t,
  } = args
  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const isFundsView = viewFilter === 'funds'
  const isProcurementView = viewFilter === 'procurement'
  const isNodeView = viewFilter === 'node'
  const isResourceStatView = isFeaturesResourceStatFilter(viewFilter)
  const isMeteringCostView = lockedViewFilter === 'metering' || embedded

  const costCatalogOrder = useMemo(
    () => buildCostCatalogOrderIndex(costCatalog),
    [costCatalog],
  )
  const visibleRows = useMemo(
    () => computeVisibleRows(rows, viewFilter, costCatalogOrder),
    [costCatalogOrder, rows, viewFilter],
  )
  const quantityFromGanttHint = isFundsView
    ? t('projectManagerPage.files.table.quantityFromCostHint')
    : viewFilter === 'scheduleAll'
      ? t('projectManagerPage.files.table.quantityFromGanttHint')
      : usesNonStackingPeakRollup(viewFilter)
        ? t('projectManagerPage.files.table.quantityFromGanttHintMachinery')
        : usesPeakConcurrentRollup(viewFilter)
          ? t('projectManagerPage.files.table.quantityFromGanttHintPeak')
          : t('projectManagerPage.files.table.quantityFromGanttHint')
  const monthFromGanttHint = isFundsView
    ? t('projectManagerPage.files.table.monthFromCostHint')
    : viewFilter === 'scheduleAll'
      ? t('projectManagerPage.files.table.monthFromGanttHint')
      : usesNonStackingPeakRollup(viewFilter)
        ? t('projectManagerPage.files.table.monthFromGanttHintMachinery')
        : usesPeakConcurrentRollup(viewFilter)
          ? t('projectManagerPage.files.table.monthFromGanttHintPeak')
          : t('projectManagerPage.files.table.monthFromGanttHint')

  const unitColumnLabel = isFundsView
    ? t('projectManagerPage.costTable.columns.unit')
    : isMeteringCostView
      ? t('projectManagerPage.costTable.columns.unit')
      : t('projectManagerPage.files.table.columns.unit')
  const fundsEngineeringQuantityLabel = t(
    'projectManagerPage.files.table.columns.engineeringQuantity',
  )
  const meteringTotalPriceLabel = t('projectManagerPage.costTable.columns.totalPrice', {
    currency: DEFAULT_COST_CURRENCY,
  })
  const fundsTotalPriceLabel = t('projectManagerPage.files.table.columns.totalPrice')
  /** Column header labels: metering (cost · 价格表) uses price-list naming. */
  const featureColumnLabel = useCallback(
    (
      column:
        | 'index'
        | 'type'
        | 'name'
        | 'quantity'
        | 'start'
        | 'finish'
        | 'remark'
        | 'sectionalWork'
        | 'code'
        | 'featureDescription'
        | 'unitPrice'
        | 'totalPrice',
    ) => {
      if (isMeteringCostView) {
        switch (column) {
          case 'index':
            return t('projectManagerPage.costTable.columns.index')
          case 'type':
            return t('projectManagerPage.costTable.columns.type')
          case 'name':
            return t('projectManagerPage.costTable.columns.name')
          case 'quantity':
            return t('projectManagerPage.costTable.columns.quantity')
          case 'remark':
            return t('projectManagerPage.costTable.columns.note')
          case 'sectionalWork':
            return t('projectManagerPage.costTable.columns.sectionalWork')
          case 'code':
            return t('projectManagerPage.costTable.columns.code')
          case 'featureDescription':
            return t('projectManagerPage.costTable.columns.featureDescription')
          case 'unitPrice':
            return t('projectManagerPage.costTable.columns.unitPrice')
          case 'totalPrice':
            return meteringTotalPriceLabel
          default:
            return t(`projectManagerPage.files.table.columns.${column}`)
        }
      }
      if (isNodeView && column === 'name') {
        return t('projectManagerPage.files.table.columns.milestoneName')
      }
      if (isFundsView && (column === 'unitPrice' || column === 'totalPrice')) {
        return column === 'totalPrice'
          ? fundsTotalPriceLabel
          : t('projectManagerPage.files.table.columns.unitPrice')
      }
      return t(`projectManagerPage.files.table.columns.${column}`)
    },
    [fundsTotalPriceLabel, isFundsView, isMeteringCostView, isNodeView, meteringTotalPriceLabel, t],
  )
  /** Funds shows 工程数量 in its own column; hide the generic quantity column. */
  const showQuantityColumn = columnVisibility.quantity && !isFundsView && !isNodeView
  const showPricingUnitColumn =
    (isProcurementView || isResourceStatView) &&
    columnVisibility.pricingUnit &&
    !isMeteringCostView
  const showUnitPriceColumn =
    (isResourceStatView || isFundsView) &&
    columnVisibility.unitPrice &&
    !isMeteringCostView
  const showTotalPriceColumn =
    (isResourceStatView || isFundsView) &&
    columnVisibility.totalPrice &&
    !isMeteringCostView
  const showMeteringMethodColumn =
    isResourceStatView && columnVisibility.meteringMethod && !isMeteringCostView
  const showPricingQuantityColumn =
    isResourceStatView && columnVisibility.pricingQuantity && !isMeteringCostView
  const showPurchaseCycleColumn =
    isProcurementView && columnVisibility.purchaseCycle && !isMeteringCostView
  const showTransportCycleColumn =
    isProcurementView && columnVisibility.transportCycle && !isMeteringCostView
  /** Metering under 价格表 matches the price-list column set (no schedule date/month cols). */
  const showUnitColumn =
    !isNodeView && (isMeteringCostView ? meteringColumnVisibility.unit : columnVisibility.unit)
  /** 资金: 工程数量 after 单位 (name → unit → engineering quantity → …). */
  const showFundsEngineeringQuantityColumn = isFundsView
  const showTypeColumn = isMeteringCostView
    ? meteringColumnVisibility.type
    : isNodeView
      ? false
      : columnVisibility.type
  const showNameColumn = isMeteringCostView
    ? meteringColumnVisibility.name
    : isNodeView
      ? true
      : columnVisibility.name
  const showDurationColumn = isNodeView && columnVisibility.duration
  const showStartColumn = !isMeteringCostView && !isNodeView && columnVisibility.start
  const showFinishColumn = !isMeteringCostView && columnVisibility.finish
  const showPlannedPercentColumn = isNodeView && columnVisibility.plannedPercent
  const showRemarkColumn =
    !isNodeView &&
    (isMeteringCostView ? meteringColumnVisibility.note : columnVisibility.remark)

  const resourceRollups = useMemo(
    () => computeFeatureGanttRollups(workItems, rows),
    [rows, workItems],
  )
  const costRollups = useMemo(
    () => computeFeatureCostRollups(workItems, rows, costCatalog),
    [costCatalog, rows, workItems],
  )
  const nodeRollups = useMemo(
    () => computeFeatureNodeRollups(nodeSeeds, rows, workItems),
    [nodeSeeds, rows, workItems],
  )
  const rollups = isFundsView ? costRollups : resourceRollups
  const fundsSectionMetaByRowId = useMemo(
    () => buildFundsSectionMetaByRowId(costSeeds),
    [costSeeds],
  )
  const fundsDisplayEntries = useMemo(() => {
    if (!isFundsView) return null
    return buildFundsDisplayEntries(
      visibleRows,
      fundsSectionMetaByRowId,
      rollups,
      t('projectManagerPage.costTable.views.sectionEmpty'),
    )
  }, [fundsSectionMetaByRowId, isFundsView, rollups, t, visibleRows])
  const fundsTotals = useMemo(() => {
    if (!isFundsView) return null
    return computeFundsTotals(visibleRows, rollups)
  }, [isFundsView, rollups, visibleRows])
  const resourceStatTotals = useMemo(() => {
    if (!isResourceStatView || visibleRows.length === 0) return null
    return computeResourceStatTotals(visibleRows, rollups, {
      sumQuantities: viewFilter !== 'scheduleAll',
    })
  }, [isResourceStatView, rollups, viewFilter, visibleRows])
  const monthKeys = useMemo(() => {
    const scoped = new Map(
      visibleRows.map((row) => {
        const rollup = rollups.get(row.id)
        return [
          row.id,
          rollup ?? {
            quantity: 0,
            pricingQuantity: 0,
            startDate: null,
            finishDate: null,
            monthly: {},
          },
        ] as const
      }),
    )
    return collectRollupMonthKeys(scoped)
  }, [rollups, visibleRows])
  const yearBands = useMemo(() => groupMonthKeysByYear(monthKeys), [monthKeys])
  const showMonths =
    columnVisibility.months && monthKeys.length > 0 && !isMeteringCostView && !isNodeView
  const visibleYearBands = useMemo(
    () => (showMonths ? yearBands : []),
    [showMonths, yearBands],
  )
  const visibleMonthKeys = useMemo(
    () => (showMonths ? monthKeys : []),
    [monthKeys, showMonths],
  )
  const headerRowSpan = visibleMonthKeys.length > 0 ? 2 : 1

  return {
    byId, isFundsView, isProcurementView, isNodeView, isResourceStatView, isMeteringCostView,
    costCatalogOrder, visibleRows,
    quantityFromGanttHint, monthFromGanttHint, unitColumnLabel, fundsEngineeringQuantityLabel,
    meteringTotalPriceLabel, featureColumnLabel, showQuantityColumn, showPricingUnitColumn,
    showUnitPriceColumn, showTotalPriceColumn, showMeteringMethodColumn, showPricingQuantityColumn,
    showPurchaseCycleColumn, showTransportCycleColumn, showUnitColumn, showFundsEngineeringQuantityColumn,
    showTypeColumn, showNameColumn, showDurationColumn, showStartColumn, showFinishColumn,
    showPlannedPercentColumn, showRemarkColumn, rollups, nodeRollups, fundsDisplayEntries, fundsTotals,
    resourceStatTotals, yearBands, visibleYearBands, visibleMonthKeys, headerRowSpan,
  }
}
