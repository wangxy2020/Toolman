import {
  IpcChannel,
  type KnowledgeFolderFileItem,
  type PmApplyResourcePlanInput,
  type PmApplyScheduleInput,
  type PmApplyWbsInput,
  type PmDomain,
  type PmProject,
  type PmSharedResourceCatalogRow,
  type PmTimeEntry,
  type PmTimeEntryUpdateInput,
  type PmWorkItem,
  type PmWorkItemCreateInput,
  type PmWorkItemListInput,
  type PmWorkItemUpdateInput,
} from '@toolman/shared'

async function invoke<T>(channel: IpcChannel, input?: unknown): Promise<T> {
  const result = await window.api.invoke(channel, input)
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.data as T
}

export const pmApi = {
  listProjects(workspaceId: string, domain?: PmDomain) {
    return invoke<{ projects: PmProject[] }>(IpcChannel.Pm_ProjectList, {
      workspaceId,
      domain,
    })
  },

  createProject(input: import('@toolman/shared').PmProjectCreateInput) {
    return invoke<PmProject>(IpcChannel.Pm_ProjectCreate, input)
  },

  getProject(id: string) {
    return invoke<PmProject>(IpcChannel.Pm_ProjectGet, { id })
  },

  updateProject(input: import('@toolman/shared').PmProjectUpdateInput) {
    return invoke<PmProject>(IpcChannel.Pm_ProjectUpdate, input)
  },

  deleteProject(id: string) {
    return invoke<{ ok: boolean }>(IpcChannel.Pm_ProjectDelete, { id })
  },

  getWorkItem(id: string) {
    return invoke<PmWorkItem>(IpcChannel.Pm_WorkItemGet, { id })
  },

  listWorkItems(input: PmWorkItemListInput) {
    return invoke<{ items: PmWorkItem[] }>(IpcChannel.Pm_WorkItemList, input)
  },

  listUrgentWorkItems(workspaceId: string, limit = 200) {
    return invoke<{ items: PmWorkItem[] }>(IpcChannel.Pm_WorkItemList, {
      workspaceId,
      urgentOnly: true,
      limit,
    })
  },

  createWorkItem(input: PmWorkItemCreateInput) {
    return invoke<PmWorkItem>(IpcChannel.Pm_WorkItemCreate, input)
  },

  updateWorkItem(input: PmWorkItemUpdateInput) {
    return invoke<PmWorkItem>(IpcChannel.Pm_WorkItemUpdate, input)
  },

  deleteWorkItem(id: string) {
    return invoke<{ ok: boolean }>(IpcChannel.Pm_WorkItemDelete, { id })
  },

  listFolderFiles(folderPath: string) {
    return invoke<{ items: KnowledgeFolderFileItem[] }>(IpcChannel.KnowledgeFolderListFiles, {
      folderPath,
    })
  },

  listTimeEntries(workspaceId: string, projectId?: string) {
    return invoke<{ entries: import('@toolman/shared').PmTimeEntry[] }>(
      IpcChannel.Pm_TimeEntryList,
      { workspaceId, projectId },
    )
  },

  createTimeEntry(input: import('@toolman/shared').PmTimeEntryCreateInput) {
    return invoke<PmTimeEntry>(IpcChannel.Pm_TimeEntryCreate, input)
  },

  updateTimeEntry(input: PmTimeEntryUpdateInput) {
    return invoke<PmTimeEntry>(IpcChannel.Pm_TimeEntryUpdate, input)
  },

  deleteTimeEntry(id: string) {
    return invoke<{ ok: boolean }>(IpcChannel.Pm_TimeEntryDelete, { id })
  },

  listDocumentLinks(workspaceId: string, projectId?: string) {
    return invoke<{ links: import('@toolman/shared').PmDocumentLink[] }>(
      IpcChannel.Pm_DocumentLinkList,
      { workspaceId, projectId },
    )
  },

  createDocumentLink(input: import('@toolman/shared').PmDocumentLinkCreateInput) {
    return invoke<import('@toolman/shared').PmDocumentLink>(
      IpcChannel.Pm_DocumentLinkCreate,
      input,
    )
  },

  deleteDocumentLink(id: string) {
    return invoke<{ ok: boolean }>(IpcChannel.Pm_DocumentLinkDelete, { id })
  },

  getDomainSettings(workspaceId: string, domain: import('@toolman/shared').PmDomain) {
    return invoke<{ settings: import('@toolman/shared').PmDomainSettings }>(
      IpcChannel.Pm_DomainSettingsGet,
      { workspaceId, domain },
    )
  },

  setDomainSettings(settings: import('@toolman/shared').PmDomainSettings) {
    return invoke<import('@toolman/shared').PmDomainSettings>(IpcChannel.Pm_DomainSettingsSet, settings)
  },

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
