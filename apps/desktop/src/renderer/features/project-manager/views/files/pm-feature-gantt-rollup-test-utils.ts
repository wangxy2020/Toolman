import type { PmWorkItem } from '@toolman/shared'

import type { PmCostRow } from '../cost/pm-cost-catalog'
import type { PmResourceRow } from '../resource/pm-resource-catalog'
import { TASK_COST_ASSIGNMENTS_KEY } from '../schedule/pm-gantt-cost-assignment'
import { TASK_RESOURCE_ASSIGNMENTS_KEY } from '../schedule/pm-gantt-resource-assignment'
import type { PmFeatureRow } from './pm-features-catalog'

export function asCostRows(
  rows: ReadonlyArray<{
    id: string
    type: PmCostRow['type']
    name: string
    code?: string
    featureDescription?: string
    unit?: string
    quantity?: number | null
    unitPrice?: number | null
    applicable?: string
    note?: string
    sectionalWork?: string
    sectionCode?: string
    sectionNote?: string
    sectionName?: string
    sectionFeatureDescription?: string
    sectionTotalFormula?: string
    sortOrder?: number
    parentId?: string | null
  }>,
): PmCostRow[] {
  return rows.map((row, index) => ({
    id: row.id,
    type: row.type,
    code: row.code ?? '',
    name: row.name,
    featureDescription: row.featureDescription ?? '',
    unit: row.unit ?? '',
    quantity: row.quantity ?? null,
    unitPrice: row.unitPrice ?? null,
    applicable: row.applicable ?? 'all',
    note: row.note ?? '',
    sectionalWork: row.sectionalWork ?? '',
    sectionCode: row.sectionCode ?? '',
    sectionNote: row.sectionNote ?? '',
    sectionName: row.sectionName ?? '',
    sectionFeatureDescription: row.sectionFeatureDescription ?? '',
    sectionTotalFormula: row.sectionTotalFormula ?? '',
    sortOrder: row.sortOrder ?? index,
    parentId: row.parentId ?? null,
  }))
}

export function asResourceRows(
  rows: ReadonlyArray<{
    id: string
    type: PmResourceRow['type']
    name: string
    unit?: string
    pricingUnit?: string
    unitPrice?: number | null
    note?: string
    applicable?: string
    sortOrder?: number
    parentId?: string | null
    spec?: string
    customTypeName?: string
  }>,
): PmResourceRow[] {
  return rows.map((row, index) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    unit: row.unit ?? '',
    pricingUnit: row.pricingUnit ?? row.unit ?? '',
    unitPrice: row.unitPrice ?? null,
    note: row.note ?? '',
    applicable: row.applicable ?? 'all',
    sortOrder: row.sortOrder ?? index,
    parentId: row.parentId ?? null,
    spec: row.spec ?? '',
    customTypeName: row.customTypeName ?? '',
  }))
}

export function makeItem(
  id: string,
  startDate: number | null,
  dueDate: number | null,
  assignments: Array<{ type: string; name: string; quantity: number | null }>,
): PmWorkItem {
  return {
    id,
    workspaceId: 'ws',
    projectId: 'p1',
    parentId: null,
    type: 'task',
    title: id,
    status: 'todo',
    priority: 'medium',
    sortOrder: 0,
    startDate,
    dueDate,
    percentComplete: 0,
    assignee: null,
    metadata: {
      [TASK_RESOURCE_ASSIGNMENTS_KEY]: assignments.map((entry) => ({
        resourceId: null,
        type: entry.type,
        name: entry.name,
        quantity: entry.quantity,
      })),
    },
    createdAt: 0,
    updatedAt: 0,
  } as unknown as PmWorkItem
}

export function makeCostItem(
  id: string,
  startDate: number,
  dueDate: number,
  assignments: Array<{
    costId: string | null
    type: string
    name: string
    percent: number
    amount: number
  }>,
): PmWorkItem {
  return {
    ...makeItem(id, startDate, dueDate, []),
    metadata: { [TASK_COST_ASSIGNMENTS_KEY]: assignments },
  } as unknown as PmWorkItem
}

export function makeFeature(
  id: string,
  type: PmFeatureRow['type'],
  name: string,
): PmFeatureRow {
  return {
    id,
    type,
    name,
    unit: '',
    pricingUnit: '',
    purchaseCycle: null,
    transportCycle: null,
    quantity: null,
    remark: '',
    code: '',
    featureDescription: '',
    sectionalWork: '',
    unitPrice: null,
    applicable: 'all',
    sortOrder: 0,
    parentId: null,
  }
}
