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
  updatePmBaseline,
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
import { applyPmResourcePlanSuggestions } from '../../../services/project-management/pm-resource-apply.service'
import { applyPmResourceCatalogPatches } from '../../../services/project-management/pm-resource-catalog-apply.service'
import {
  getSharedResourceCatalogIpc,
  setSharedResourceCatalogIpc,
  upsertSharedResourceCatalogIpc,
} from '../../../services/project-management/pm-shared-resource-catalog.service'
import { applyPmCostPlanSuggestions } from '../../../services/project-management/pm-cost-apply.service'
import { applyPmCostCatalogPatches } from '../../../services/project-management/pm-cost-catalog-apply.service'
import {
  getSharedCostCatalogIpc,
  setSharedCostCatalogIpc,
  upsertSharedCostCatalogIpc,
} from '../../../services/project-management/pm-shared-cost-catalog.service'
import { smartAssignPmWorkItems } from '../../../services/project-management/pm-smart-assign.service'
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
  [IpcChannel.Pm_BaselineUpdate]: async (input) => ipcOk(updatePmBaseline(input)),
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
  [IpcChannel.Pm_WorkItemApplyResourcePlan]: async (input) =>
    ipcOk(applyPmResourcePlanSuggestions(input)),
  [IpcChannel.Pm_ApplyResourceCatalogPatch]: async (input) =>
    ipcOk(applyPmResourceCatalogPatches(input)),
  [IpcChannel.Pm_SharedResourceCatalogGet]: async (input) =>
    ipcOk(getSharedResourceCatalogIpc(input)),
  [IpcChannel.Pm_SharedResourceCatalogSet]: async (input) =>
    ipcOk(setSharedResourceCatalogIpc(input)),
  [IpcChannel.Pm_SharedResourceCatalogUpsert]: async (input) =>
    ipcOk(upsertSharedResourceCatalogIpc(input)),
  [IpcChannel.Pm_WorkItemApplyCostPlan]: async (input) => ipcOk(applyPmCostPlanSuggestions(input)),
  [IpcChannel.Pm_ApplyCostCatalogPatch]: async (input) => ipcOk(applyPmCostCatalogPatches(input)),
  [IpcChannel.Pm_SharedCostCatalogGet]: async (input) => ipcOk(getSharedCostCatalogIpc(input)),
  [IpcChannel.Pm_SharedCostCatalogSet]: async (input) => ipcOk(setSharedCostCatalogIpc(input)),
  [IpcChannel.Pm_SharedCostCatalogUpsert]: async (input) =>
    ipcOk(upsertSharedCostCatalogIpc(input)),
  [IpcChannel.Pm_WorkItemSmartAssign]: async (input) => ipcOk(smartAssignPmWorkItems(input)),
}
