import {
  IpcChannel,
  type KnowledgeFolderFileItem,
  type PmDomain,
  type PmProject,
  type PmTimeEntry,
  type PmTimeEntryUpdateInput,
  type PmWorkItem,
  type PmWorkItemCreateInput,
  type PmWorkItemListInput,
  type PmWorkItemUpdateInput,
} from '@toolman/shared'
import { invoke } from './pm-api-invoke'

export const pmApiCore = {
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

}
