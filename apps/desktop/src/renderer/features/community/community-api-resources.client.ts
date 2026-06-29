import {
  IpcChannel,
  type CommunityInstallHistoryInput,
  type CommunityInstallItem,
  type CommunityInstallInput,
  type CommunityInstallOutput,
  type CommunityResourceCreateInput,
  type CommunityResourceDetail,
  type CommunityResourceInteractionOutput,
  type CommunityResourceItem,
  type CommunityResourceListInput,
  type CommunityResourceListOutput,
  type CommunityResourcePackageReviewDownloadOutput,
  type CommunityResourcePackageReviewOpenOutput,
  type CommunityResourcePatchInput,
  type CommunityResourcePublishInput,
} from '@toolman/shared'
import { invokeIpc } from './community-api-ipc'

export async function listCommunityResources(
  input: CommunityResourceListInput = {},
): Promise<CommunityResourceListOutput> {
  return invokeIpc(IpcChannel.CommunityResourceList, input)
}

export async function getCommunityResource(id: string): Promise<CommunityResourceDetail> {
  return invokeIpc(IpcChannel.CommunityResourceGet, { id })
}

export async function createCommunityResource(
  input: CommunityResourceCreateInput,
): Promise<CommunityResourceItem> {
  return invokeIpc(IpcChannel.CommunityResourceCreate, input)
}

export async function publishCommunityResource(
  input: CommunityResourcePublishInput,
): Promise<CommunityResourceItem> {
  return invokeIpc(IpcChannel.CommunityResourcePublish, input)
}

export async function exportCommunityKnowledgeBundle(
  kbId: string,
): Promise<{ packagePath: string }> {
  return invokeIpc(IpcChannel.CommunityKnowledgeBundleExport, { kbId })
}

export async function exportCommunityMcpPackage(
  mcpServerId: string,
): Promise<{ packagePath: string }> {
  return invokeIpc(IpcChannel.CommunityMcpPackageExport, { mcpServerId })
}

export async function prepareCommunityMcpPackage(
  packagePath: string,
  title?: string,
): Promise<{ packagePath: string; normalized: boolean; message?: string }> {
  return invokeIpc(IpcChannel.CommunityMcpPackagePrepare, { packagePath, title })
}

export async function prepareCommunitySkillPackage(
  packagePath: string,
  title?: string,
): Promise<{ packagePath: string; normalized: boolean; message?: string }> {
  return invokeIpc(IpcChannel.CommunitySkillPackagePrepare, { packagePath, title })
}

export async function prepareCommunityWorkflowPackage(
  packagePath: string,
  title?: string,
): Promise<{ packagePath: string; normalized: boolean; message?: string }> {
  return invokeIpc(IpcChannel.CommunityWorkflowPackagePrepare, { packagePath, title })
}

export async function prepareCommunityKnowledgePackage(
  packagePath: string,
  title?: string,
): Promise<{ packagePath: string; normalized: boolean; message?: string }> {
  return invokeIpc(IpcChannel.CommunityKnowledgePackagePrepare, { packagePath, title })
}

export async function deleteCommunityResource(id: string): Promise<{ deleted: boolean }> {
  return invokeIpc(IpcChannel.CommunityResourceDelete, { id })
}

export async function patchCommunityResource(
  input: CommunityResourcePatchInput,
): Promise<CommunityResourceItem> {
  return invokeIpc(IpcChannel.CommunityResourcePatch, input)
}

export async function openCommunityResourcePackageForReview(
  resourceId: string,
): Promise<CommunityResourcePackageReviewOpenOutput> {
  return invokeIpc(IpcChannel.CommunityResourcePackageReviewOpen, { resourceId })
}

export async function downloadCommunityResourcePackageForReview(
  resourceId: string,
): Promise<CommunityResourcePackageReviewDownloadOutput> {
  return invokeIpc(IpcChannel.CommunityResourcePackageReviewDownload, { resourceId })
}

export async function likeCommunityResource(
  resourceId: string,
): Promise<CommunityResourceInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityResourceLike, { resourceId })
}

export async function dislikeCommunityResource(
  resourceId: string,
): Promise<CommunityResourceInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityResourceDislike, { resourceId })
}

export async function favoriteCommunityResource(
  resourceId: string,
): Promise<CommunityResourceInteractionOutput> {
  return invokeIpc(IpcChannel.CommunityResourceFavorite, { resourceId })
}

export async function installCommunityResource(
  input: CommunityInstallInput,
): Promise<CommunityInstallOutput> {
  return invokeIpc(IpcChannel.CommunityInstall, input)
}

export async function listCommunityInstallHistory(
  input: CommunityInstallHistoryInput = {},
): Promise<{ items: CommunityInstallItem[] }> {
  return invokeIpc(IpcChannel.CommunityInstallHistory, input)
}
