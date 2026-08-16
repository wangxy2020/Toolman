import {
  IpcChannel,
  type PmApplyCostPlanInput,
  type PmApplyResourcePlanInput,
  type PmApplyScheduleInput,
  type PmApplyWbsInput,
  type PmProject,
  type PmSharedCostCatalogRow,
  type PmSharedResourceCatalogRow,
  type PmWorkItem,
} from '@toolman/shared'
import { invoke } from './pm-api-invoke'

export const pmApiCatalogs = {
  applyWbsSuggestions(input: PmApplyWbsInput) {
    return invoke<{
      projectId: string
      project: PmProject
      createdCount: number
      relationCount?: number
      cleared?: boolean
      items: PmWorkItem[]
    }>(IpcChannel.Pm_WorkItemApplyWbs, input)
  },

  applyScheduleSuggestions(input: PmApplyScheduleInput) {
    return invoke<{ updatedCount: number; items: PmWorkItem[]; projectId?: string }>(
      IpcChannel.Pm_WorkItemApplySchedule,
      input,
    )
  },

  applyResourcePlanSuggestions(input: PmApplyResourcePlanInput) {
    return invoke<{
      projectId: string
      updatedCount: number
      items: PmWorkItem[]
      catalogUpserts: Array<{
        type: string
        name: string
        unit?: string
        unitPrice?: number | null
      }>
      catalogChanged: boolean
    }>(IpcChannel.Pm_WorkItemApplyResourcePlan, input)
  },

  applyResourceCatalogPatches(input: {
    workspaceId: string
    patches: Array<{
      target: string
      upserts: Array<{
        type: PmSharedResourceCatalogRow['type']
        name: string
        unit?: string
        unitPrice?: number | null
      }>
      removes?: Array<{ type?: PmSharedResourceCatalogRow['type']; name: string }>
    }>
  }) {
    return invoke<{
      workspaceId: string
      sharedChanged: boolean
      changedCount: number
      results: Array<{
        target: string
        scope: 'shared' | 'project'
        projectId?: string
        projectCode?: string
        changed: boolean
        upserted: number
        removed: number
        rowCount: number
      }>
    }>(IpcChannel.Pm_ApplyResourceCatalogPatch, input)
  },

  getSharedResourceCatalog(workspaceId: string) {
    return invoke<{ rows: PmSharedResourceCatalogRow[]; isDefault: boolean }>(
      IpcChannel.Pm_SharedResourceCatalogGet,
      { workspaceId },
    )
  },

  setSharedResourceCatalog(workspaceId: string, rows: PmSharedResourceCatalogRow[]) {
    return invoke<{ rows: PmSharedResourceCatalogRow[] }>(IpcChannel.Pm_SharedResourceCatalogSet, {
      workspaceId,
      rows,
    })
  },

  upsertSharedResourceCatalog(
    workspaceId: string,
    upserts: Array<{
      type: PmSharedResourceCatalogRow['type']
      name: string
      unit?: string
      pricingUnit?: string
      unitPrice?: number | null
      spec?: string
      note?: string
    }>,
  ) {
    return invoke<{ rows: PmSharedResourceCatalogRow[]; changed: boolean }>(
      IpcChannel.Pm_SharedResourceCatalogUpsert,
      { workspaceId, upserts },
    )
  },

  applyCostPlanSuggestions(input: PmApplyCostPlanInput) {
    return invoke<{
      projectId: string
      updatedCount: number
      items: PmWorkItem[]
      catalogUpserts: Array<{
        type: string
        name: string
        unit?: string
        quantity?: number | null
        unitPrice?: number | null
      }>
      catalogChanged: boolean
    }>(IpcChannel.Pm_WorkItemApplyCostPlan, input)
  },

  applyCostCatalogPatches(input: {
    workspaceId: string
    patches: Array<{
      target: string
      upserts: Array<{
        type: PmSharedCostCatalogRow['type']
        name: string
        code?: string
        unit?: string
        quantity?: number | null
        unitPrice?: number | null
        featureDescription?: string
        note?: string
        sectionalWork?: string
      }>
      removes?: Array<{ type?: PmSharedCostCatalogRow['type']; name: string }>
    }>
  }) {
    return invoke<{
      workspaceId: string
      sharedChanged: boolean
      changedCount: number
      results: Array<{
        target: string
        scope: 'shared' | 'project'
        projectId?: string
        projectCode?: string
        changed: boolean
        upserted: number
        removed: number
        rowCount: number
      }>
    }>(IpcChannel.Pm_ApplyCostCatalogPatch, input)
  },

  getSharedCostCatalog(workspaceId: string) {
    return invoke<{ rows: PmSharedCostCatalogRow[]; isDefault: boolean }>(
      IpcChannel.Pm_SharedCostCatalogGet,
      { workspaceId },
    )
  },

  setSharedCostCatalog(workspaceId: string, rows: PmSharedCostCatalogRow[]) {
    return invoke<{ rows: PmSharedCostCatalogRow[] }>(IpcChannel.Pm_SharedCostCatalogSet, {
      workspaceId,
      rows,
    })
  },

  upsertSharedCostCatalog(
    workspaceId: string,
    upserts: Array<{
      type: PmSharedCostCatalogRow['type']
      name: string
      code?: string
      unit?: string
      quantity?: number | null
      unitPrice?: number | null
      featureDescription?: string
      note?: string
      sectionalWork?: string
    }>,
  ) {
    return invoke<{ rows: PmSharedCostCatalogRow[]; changed: boolean }>(
      IpcChannel.Pm_SharedCostCatalogUpsert,
      { workspaceId, upserts },
    )
  },

  smartAssignWorkItems(input: { workspaceId: string; projectId: string; kind: 'resource' | 'cost' }) {
    return invoke<{ updatedCount: number; items: PmWorkItem[] }>(
      IpcChannel.Pm_WorkItemSmartAssign,
      input,
    )
  },

  listKnowledgeBases(workspaceId: string) {
    return invoke<{ items: import('@toolman/shared').KnowledgeBase[] }>(
      IpcChannel.KnowledgeBaseList,
      { workspaceId },
    )
  },

  listKnowledgeDocuments(workspaceId: string, kbId: string) {
    return invoke<{ items: import('@toolman/shared').KnowledgeDocument[] }>(
      IpcChannel.KnowledgeDocumentList,
      { workspaceId, kbId },
    )
  },
}
