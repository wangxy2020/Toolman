import { IpcChannel, ipcOk } from '@toolman/shared'

import {
  createPmProject,
  deletePmProject,
  getPmProject,
  listPmProjects,
  updatePmProject,
} from '../../../services/project-management/pm-project.service'
import {
  createPmWorkItem,
  deletePmWorkItem,
  getPmWorkItem,
  listPmWorkItems,
  updatePmWorkItem,
} from '../../../services/project-management/pm-work-item.service'
import {
  createPmBaseline,
  deletePmBaseline,
  getPmBaseline,
  listPmBaselines,
  restorePmBaseline,
} from '../../../services/project-management/pm-baseline.service'
import {
  createPmRelation,
  deletePmRelation,
  listPmRelations,
} from '../../../services/project-management/pm-relation.service'
import {
  createPmDocumentLink,
  deletePmDocumentLink,
  listPmDocumentLinks,
} from '../../../services/project-management/pm-document-link.service'
import {
  getPmDomainSettingsIpc,
  setPmDomainSettings,
} from '../../../services/project-management/pm-domain-settings.service'
import {
  createPmTimeEntry,
  deletePmTimeEntry,
  listPmTimeEntries,
  updatePmTimeEntry,
} from '../../../services/project-management/pm-time-entry.service'
import {
  applyPmScheduleSuggestions,
  applyPmWbsSuggestions,
} from '../../../services/project-management/pm-plan-apply.service'
import type { HandlerFn } from './types'

export const pmIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.Pm_ProjectList]: async (input) => ipcOk(listPmProjects(input)),
  [IpcChannel.Pm_ProjectGet]: async (input) => ipcOk(getPmProject(input)),
  [IpcChannel.Pm_ProjectCreate]: async (input) => ipcOk(createPmProject(input)),
  [IpcChannel.Pm_ProjectUpdate]: async (input) => ipcOk(updatePmProject(input)),
  [IpcChannel.Pm_ProjectDelete]: async (input) => ipcOk(deletePmProject(input)),
  [IpcChannel.Pm_WorkItemList]: async (input) => ipcOk(listPmWorkItems(input)),
  [IpcChannel.Pm_WorkItemGet]: async (input) => ipcOk(getPmWorkItem(input)),
  [IpcChannel.Pm_WorkItemCreate]: async (input) => ipcOk(createPmWorkItem(input)),
  [IpcChannel.Pm_WorkItemUpdate]: async (input) => ipcOk(updatePmWorkItem(input)),
  [IpcChannel.Pm_WorkItemDelete]: async (input) => ipcOk(deletePmWorkItem(input)),
  [IpcChannel.Pm_RelationList]: async (input) => ipcOk(listPmRelations(input)),
  [IpcChannel.Pm_RelationCreate]: async (input) => ipcOk(createPmRelation(input)),
  [IpcChannel.Pm_RelationDelete]: async (input) => ipcOk(deletePmRelation(input)),
  [IpcChannel.Pm_BaselineList]: async (input) => ipcOk(listPmBaselines(input)),
  [IpcChannel.Pm_BaselineCreate]: async (input) => ipcOk(createPmBaseline(input)),
  [IpcChannel.Pm_BaselineGet]: async (input) => ipcOk(getPmBaseline(input)),
  [IpcChannel.Pm_BaselineDelete]: async (input) => ipcOk(deletePmBaseline(input)),
  [IpcChannel.Pm_BaselineRestore]: async (input) => ipcOk(restorePmBaseline(input)),
  [IpcChannel.Pm_TimeEntryList]: async (input) => ipcOk(listPmTimeEntries(input)),
  [IpcChannel.Pm_TimeEntryCreate]: async (input) => ipcOk(createPmTimeEntry(input)),
  [IpcChannel.Pm_TimeEntryUpdate]: async (input) => ipcOk(updatePmTimeEntry(input)),
  [IpcChannel.Pm_TimeEntryDelete]: async (input) => ipcOk(deletePmTimeEntry(input)),
  [IpcChannel.Pm_DocumentLinkList]: async (input) => ipcOk(listPmDocumentLinks(input)),
  [IpcChannel.Pm_DocumentLinkCreate]: async (input) => ipcOk(createPmDocumentLink(input)),
  [IpcChannel.Pm_DocumentLinkDelete]: async (input) => ipcOk(deletePmDocumentLink(input)),
  [IpcChannel.Pm_DomainSettingsGet]: async (input) => ipcOk(getPmDomainSettingsIpc(input)),
  [IpcChannel.Pm_DomainSettingsSet]: async (input) => ipcOk(setPmDomainSettings(input)),
  [IpcChannel.Pm_WorkItemApplyWbs]: async (input) => ipcOk(applyPmWbsSuggestions(input)),
  [IpcChannel.Pm_WorkItemApplySchedule]: async (input) => ipcOk(applyPmScheduleSuggestions(input)),
}
