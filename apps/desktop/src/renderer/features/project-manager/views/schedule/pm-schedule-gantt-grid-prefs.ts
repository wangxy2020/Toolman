import type { GanttUiPrefs } from './pm-gantt-prefs'
import {
  buildCostViewColumnOrder,
  buildListViewColumnOrder,
  buildResourceViewColumnOrder,
  PROGRESS_CHECK_COLUMN_ORDER,
} from './pm-gantt-prefs'
import type { useI18n } from '../../../../i18n/useI18n'

export function buildGanttGridPrefs(args: {
  uiPrefs: GanttUiPrefs
  isResourceView: boolean
  isCostView: boolean
  isProgressCheckView: boolean
  isListView: boolean
  resourceSlotCount: number
  costSlotCount: number
  t: ReturnType<typeof useI18n>['t']
}): GanttUiPrefs {
  const { uiPrefs, isResourceView, isCostView, isProgressCheckView, isListView, resourceSlotCount, costSlotCount, t } = args
  if (isResourceView) {
    return {
      ...uiPrefs,
      resourceView: { ...uiPrefs.resourceView, slotCount: resourceSlotCount },
      columnOrder: buildResourceViewColumnOrder({ ...uiPrefs.resourceView, slotCount: resourceSlotCount }),
      columnLabels: {
        ...uiPrefs.columnLabels,
        resourceType: t('projectManagerPage.schedule.columns.resourceType'),
        resourceName: t('projectManagerPage.schedule.columns.resourceName'),
        resourceQty: t('projectManagerPage.schedule.columns.resourceQty'),
        spacer: '',
      },
    }
  }
  if (isCostView) {
    return {
      ...uiPrefs,
      costView: { ...uiPrefs.costView, slotCount: costSlotCount },
      columnOrder: buildCostViewColumnOrder({ ...uiPrefs.costView, slotCount: costSlotCount }),
      columnLabels: {
        ...uiPrefs.columnLabels,
        costName: t('projectManagerPage.schedule.columns.costName'),
        costAmount: t('projectManagerPage.schedule.columns.costAmount'),
        costPercent: t('projectManagerPage.schedule.columns.costPercent'),
        costAmountUnit: t('projectManagerPage.schedule.columns.costAmountUnit'),
        costNote: t('projectManagerPage.schedule.columns.costNote'),
        spacer: '',
      },
    }
  }
  if (isProgressCheckView) {
    return { ...uiPrefs, columnOrder: [...PROGRESS_CHECK_COLUMN_ORDER] }
  }
  if (isListView) {
    return {
      ...uiPrefs,
      columnOrder: buildListViewColumnOrder(uiPrefs.columnOrder),
      columnLabels: { ...uiPrefs.columnLabels, spacer: '' },
    }
  }
  return uiPrefs
}
