import { ipcMain } from 'electron'
import {
  IpcChannel,
  AppGetInfoOutputSchema,
  AppGetPathsOutputSchema,
  AssistantDeleteInputSchema,
  AuthBindProviderInputSchema,
  AuthDeleteAccountInputSchema,
  AuthExchangeHubTokenInputSchema,
  AuthLoginInputSchema,
  AuthLogoutInputSchema,
  AuthChangePasswordInputSchema,
  AuthResetPasswordInputSchema,
  AuthSendSmsCodeInputSchema,
  AuthVerifyDeleteReauthInputSchema,
  AUTH_ERROR_CODES,
  AuthMergeRequiredDetailsSchema,
  ipcOk,
  ipcErr,
  type IpcResult,
} from '@toolman/shared'
import { ProviderError } from '@toolman/model-gateway'
import * as sessionService from '../services/session.service'
import * as agentService from '../services/agent.service'
import * as assistantService from '../services/assistant.service'
import { getSessionRepository } from '../db/repos'
import * as mcpStatusService from '../services/mcp-status.service'
import * as mcpService from '../services/mcp.service'
import * as skillsFacade from '../services/skills-facade.service'
import * as imChannelFacade from '../services/im-channel.facade.service'
import * as providerService from '../services/provider.service'
import * as workspaceService from '../services/workspace.service'
import * as identityService from '../services/identity.service'
import * as authSessionService from '../services/auth-session.service'
import * as authLoginService from '../services/auth/auth-login.service'
import {
  deleteAuthAccountRemote,
  verifyDeleteAccountReauth,
} from '../services/auth/auth-delete-account.service'
import { bindAuthProvider, AuthMergeRequiredError } from '../services/auth/tencent-wechat-auth.service'
import { getFirebaseWebConfig } from '../services/auth/firebase-auth.config'
import { getTencentWebConfig } from '../services/auth/tencent-auth.config'
import { getAuthBuildProfile } from '../services/auth/auth-build-profile.service'
import { AuthLoginError, readAuthServiceErrorMessage } from '../services/auth/auth-login.error'
import { exchangeAuthHubToken } from '../services/auth/auth-hub-token.service'
import * as memoryEntryService from '../services/memory-entry.service'
import { getAppInfo, getAppPaths } from './app'
import { syncRuntimeAppSettings } from '../services/runtime-app-settings.service'
import {
  backupAppData,
  clearAppCache,
  deleteKnowledgeFiles,
  getStorageStats,
  openPathInShell,
  revealPathInShell,
  resetAppData,
  restoreAppData,
} from '../services/app-storage.service'
import { saveFile, selectFiles, selectFilesOrFolders, selectFolder } from './dialog'
import { readFilesForChat } from '../services/file-read.service'
import { stageChatAttachments } from '../services/chat-attachment-stage.service'
import { exportNotesSyncFile, importNotesAttachment } from '../services/notes-files.service'
import { ingestNotesToKnowledgeBase, getNoteById, getNotesDataJson, syncNotesData } from '../services/notes-data.service'
import * as knowledgeService from '../services/knowledge.service'
import * as knowledgeDocumentService from '../services/knowledge-document.service'
import * as knowledgeSourceService from '../services/knowledge-source.service'
import * as knowledgeFolderService from '../services/knowledge-folder.service'
import { scanKnowledgeFolderPreview } from '../services/knowledge-folder-preview.service'
import {
  deleteKnowledgeFolderFile,
  importKnowledgeFolderFiles,
  listKnowledgeFolderFiles,
} from '../services/knowledge-folder-files.service'
import { ensureDefaultFolderKnowledgeBase } from '../services/knowledge-default-folder-kb.service'
import * as knowledgeDedupService from '../services/knowledge-dedup.service'
import * as knowledgeFileRegistryService from '../services/knowledge-file-registry.service'
import * as knowledgeIngestJobService from '../services/knowledge-ingest-job.service'
import { rebuildKnowledgeFtsIndex } from '../services/knowledge-fts.service'
import { getBlobMeta, getBlobDataUrl, writeBlobFromPath } from '../services/blob.service'
import {
  BlobGetDataUrlInputSchema,
  BlobGetMetaInputSchema,
  BlobUploadInputSchema,
  ToolApprovalRespondInputSchema,
} from '@toolman/shared'
import { respondToolApproval } from '../services/tool-approval.service'
import { P2pBridge } from '../services/p2p/p2p-bridge'
import * as p2pDiscoveryService from '../services/p2p/p2p-discovery.service'
import {
  P2pDiscoveryListNodesInputSchema,
  P2pDiscoveryListNodesOutputSchema,
  P2pDiscoveryStartOutputSchema,
  P2pConnectionConnectInputSchema,
  P2pConnectionConnectOutputSchema,
  P2pConnectionDisconnectInputSchema,
  P2pConnectionDisconnectOutputSchema,
  P2pConnectionListOutputSchema,
  P2pNetworkGetConfigOutputSchema,
  P2pNetworkGetSnapshotOutputSchema,
  P2pNetworkSetStunServersInputSchema,
  P2pNetworkSetStunServersOutputSchema,
  P2pDeviceGetInfoOutputSchema,
  P2pPingOutputSchema,
  P2pWorkspaceCreateInputSchema,
  P2pWorkspaceCreateOutputSchema,
  P2pWorkspaceDeleteInputSchema,
  P2pWorkspaceDeleteOutputSchema,
  P2pWorkspaceGetInputSchema,
  P2pWorkspaceGetOutputSchema,
  P2pWorkspaceLeaveInputSchema,
  P2pWorkspaceLeaveOutputSchema,
  P2pWorkspaceGetStoragePathInputSchema,
  P2pWorkspaceGetStoragePathOutputSchema,
  P2pWorkspaceListInputSchema,
  P2pWorkspaceListOutputSchema,
  P2pWorkspaceUpdateInputSchema,
  P2pWorkspaceUpdateOutputSchema,
  P2pMemberListInputSchema,
  P2pMemberListOutputSchema,
  P2pMemberInviteInputSchema,
  P2pMemberInviteOutputSchema,
  P2pMemberJoinInputSchema,
  P2pMemberJoinOutputSchema,
  P2pMemberRemoveInputSchema,
  P2pMemberRemoveOutputSchema,
  P2pMemberUpdateRoleInputSchema,
  P2pMemberUpdateRoleOutputSchema,
  P2pMemberTrustDeviceInputSchema,
  P2pMemberTrustDeviceOutputSchema,
  P2pEventListInputSchema,
  P2pEventListOutputSchema,
  P2pEventGetInputSchema,
  P2pEventGetOutputSchema,
  P2pSyncWorkspaceInputSchema,
  P2pSyncStartOutputSchema,
  P2pSyncStopOutputSchema,
  P2pSyncStatusOutputSchema,
  P2pSyncForceInputSchema,
  P2pSyncForceOutputSchema,
  P2pSyncCatchUpInputSchema,
  P2pSyncCatchUpOutputSchema,
  P2pKnowledgeRemoveDocumentsInputSchema,
  P2pKnowledgeRemoveDocumentsOutputSchema,
  P2pKnowledgeSetDocumentPermissionInputSchema,
  P2pKnowledgeSetDocumentPermissionOutputSchema,
  P2pKnowledgeEnsureDocumentSavedInputSchema,
  P2pKnowledgeEnsureDocumentSavedOutputSchema,
  P2pKnowledgeMaterializeDocumentInputSchema,
  P2pKnowledgeMaterializeDocumentOutputSchema,
  P2pKnowledgeShareInputSchema,
  P2pKnowledgeShareOutputSchema,
  P2pKnowledgeSyncDocumentInputSchema,
  P2pKnowledgeSyncDocumentOutputSchema,
  P2pResourceListInputSchema,
  P2pResourceListOutputSchema,
  P2pResourceUnshareInputSchema,
  P2pResourceUnshareOutputSchema,
  P2pNoteShareInputSchema,
  P2pNoteShareOutputSchema,
  P2pNotePushUpdateInputSchema,
  P2pNotePushUpdateOutputSchema,
  P2pNoteSetPermissionInputSchema,
  P2pNoteSetPermissionOutputSchema,
  P2pNoteListShareTargetsInputSchema,
  P2pNoteListShareTargetsOutputSchema,
  P2pAgentExportPackageInputSchema,
  P2pAgentExportPackageOutputSchema,
  P2pAgentImportPackageInputSchema,
  P2pAgentImportPackageOutputSchema,
  P2pAgentShareInputSchema,
  P2pAgentShareOutputSchema,
  P2pAgentRemoveSessionsInputSchema,
  P2pAgentRemoveSessionsOutputSchema,
  P2pAgentSetSessionPermissionInputSchema,
  P2pAgentSetSessionPermissionOutputSchema,
  P2pAgentOpenSessionInputSchema,
  P2pAgentOpenSessionOutputSchema,
  P2pGroupChatListInputSchema,
  P2pGroupChatListOutputSchema,
  P2pGroupChatSendInputSchema,
  P2pGroupChatSendOutputSchema,
  P2pGroupChatDeleteInputSchema,
  P2pGroupChatDeleteOutputSchema,
  P2pGroupChatClearInputSchema,
  P2pGroupChatClearOutputSchema,
} from '@toolman/shared'
import * as p2pConnectionService from '../services/p2p/p2p-connection.service'
import * as p2pDeviceIdentityService from '../services/p2p/p2p-device-identity.service'
import * as p2pWorkspaceService from '../services/p2p/p2p-workspace.service'
import * as p2pInviteService from '../services/p2p/p2p-invite.service'
import * as p2pMemberService from '../services/p2p/p2p-member.service'
import * as p2pPeerService from '../services/p2p/p2p-peer.service'
import * as p2pEventService from '../services/p2p/p2p-event.service'
import * as p2pSyncService from '../services/p2p/p2p-sync.service'
import * as p2pKnowledgeSyncService from '../services/p2p/knowledge-sync.service'
import * as p2pNoteSyncService from '../services/p2p/note-sync.service'
import * as p2pAgentShareService from '../services/p2p/agent-share.service'
import * as p2pGroupAgentProxyService from '../services/p2p/p2p-group-agent-proxy.service'
import * as p2pGroupChatService from '../services/p2p/p2p-group-chat.service'
import {
  applyP2pNetworkConfig,
  getP2pStunServers,
  setP2pStunServers,
} from '../services/p2p/p2p-network.config'
import { getP2pNetworkSnapshot } from '../services/p2p/p2p-network-manager.service'
import { P2pSharedResourceRepository } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'
import { communityHandlers } from './community-handlers'
import { wrapHandlerWithAuthGate, mapAuthGateError } from './auth-gate'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

const handlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.AppGetInfo]: async () => ipcOk(AppGetInfoOutputSchema.parse(getAppInfo())),
  [IpcChannel.AppGetDiagnostics]: async () => {
    try {
      const { getAppDiagnostics } = await import('../services/app-diagnostics.service')
      return ipcOk(await getAppDiagnostics())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to collect diagnostics'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: true })
    }
  },

  [IpcChannel.BillingListPlans]: async () => {
    try {
      const { listBillingPlans } = await import('../services/billing/billing.service')
      return ipcOk(listBillingPlans())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list billing plans'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BillingCreateOrder]: async (input) => {
    try {
      const { createBillingOrder } = await import('../services/billing/billing.service')
      return ipcOk(createBillingOrder(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create billing order'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BillingGetOrderStatus]: async (input) => {
    try {
      const { getBillingOrderStatus } = await import('../services/billing/billing.service')
      return ipcOk(getBillingOrderStatus(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get billing order status'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: true })
    }
  },

  [IpcChannel.BillingMockPay]: async (input) => {
    try {
      const { mockPayBillingOrder } = await import('../services/billing/billing.service')
      const result = mockPayBillingOrder(input)
      return ipcOk(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to mock pay billing order'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.AppRuntimeSettingsSync]: async (input) => {
    const patch = input as { documentOcrEnabled?: boolean }
    return ipcOk(syncRuntimeAppSettings(patch))
  },
  [IpcChannel.AppGetPaths]: async () => ipcOk(AppGetPathsOutputSchema.parse(getAppPaths())),

  [IpcChannel.AppShellOpenPath]: async (input) => {
    const { path } = (input as { path: string }) ?? {}
    if (!path) {
      return ipcErr({ code: 'VALIDATION_ERROR', message: 'path is required', retryable: false })
    }
    return ipcOk(await openPathInShell(path))
  },

  [IpcChannel.AppShellRevealPath]: async (input) => {
    const { path } = (input as { path: string }) ?? {}
    if (!path) {
      return ipcErr({ code: 'VALIDATION_ERROR', message: 'path is required', retryable: false })
    }
    return ipcOk(revealPathInShell(path))
  },

  [IpcChannel.AppGetStorageStats]: async () => ipcOk(getStorageStats()),

  [IpcChannel.AppClearCache]: async () => ipcOk(clearAppCache()),

  [IpcChannel.AppBackupData]: async (input) => {
    try {
      const data = input as { notesDataJson?: string } | undefined
      return ipcOk(await backupAppData(data))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backup failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AppRestoreData]: async (input) => {
    try {
      const data = input as { backupPath: string; restoreKnowledge?: boolean }
      return ipcOk(await restoreAppData(data))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AppResetData]: async () => ipcOk(resetAppData()),

  [IpcChannel.AppDeleteKnowledge]: async () => {
    deleteKnowledgeFiles()
    return ipcOk({ deleted: true })
  },

  [IpcChannel.KnowledgeBaseList]: async (input) =>
    ipcOk({ items: knowledgeService.listKnowledgeBases(input) }),

  [IpcChannel.KnowledgeBaseGet]: async (input) => {
    const kb = knowledgeService.getKnowledgeBase(input)
    if (!kb) return ipcErr({ code: 'NOT_FOUND', message: 'Knowledge base not found', retryable: false })
    return ipcOk(kb)
  },

  [IpcChannel.KnowledgeBaseCreate]: async (input) => {
    try {
      return ipcOk(knowledgeService.createKnowledgeBase(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Create failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeBaseUpdate]: async (input) => {
    const kb = knowledgeService.updateKnowledgeBase(input)
    if (!kb) return ipcErr({ code: 'NOT_FOUND', message: 'Knowledge base not found', retryable: false })
    return ipcOk(kb)
  },

  [IpcChannel.KnowledgeBaseDelete]: async (input) => {
    const deleted = await knowledgeService.deleteKnowledgeBase(input)
    return ipcOk({ deleted })
  },

  [IpcChannel.KnowledgeBaseStorageEnsure]: async (input) => {
    try {
      const path = knowledgeFolderService.ensureKnowledgeBaseStoragePath(input)
      return ipcOk({ path })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ensure storage path failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeDocumentList]: async (input) =>
    ipcOk({ items: await knowledgeDocumentService.listKnowledgeDocuments(input) }),

  [IpcChannel.KnowledgeDocumentIngest]: async (input) => {
    try {
      return ipcOk(await knowledgeDocumentService.ingestKnowledgeDocuments(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ingest failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeDocumentDelete]: async (input) => {
    const deleted = await knowledgeDocumentService.deleteKnowledgeDocument(input)
    return ipcOk({ deleted })
  },

  [IpcChannel.KnowledgeDocumentReindex]: async (input) => {
    try {
      return ipcOk(await knowledgeDocumentService.reindexKnowledgeDocument(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reindex failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeKbReindex]: async (input) => {
    try {
      return ipcOk(await knowledgeDocumentService.reindexKnowledgeBaseDocuments(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reindex failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFtsRebuild]: async () => {
    try {
      return ipcOk(rebuildKnowledgeFtsIndex())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FTS rebuild failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSearch]: async (input) => {
    try {
      const items = await knowledgeDocumentService.searchKnowledge(input)
      return ipcOk({ items })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceList]: async (input) =>
    ipcOk({ items: knowledgeSourceService.listKnowledgeSources(input) }),

  [IpcChannel.KnowledgeSourceAddFolder]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeWatchFolder(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Add folder failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceAddUrl]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeUrl(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Add URL failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceAddSitemap]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeSitemap(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Add Sitemap failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeIngestJobList]: async (input) =>
    ipcOk({ items: knowledgeDocumentService.listKnowledgeIngestJobs(input) }),

  [IpcChannel.KnowledgeIngestJobCancel]: async (input) =>
    ipcOk({ cancelled: knowledgeIngestJobService.cancelKnowledgeIngestJob(input) }),

  [IpcChannel.KnowledgeIngestJobRetry]: async (input) =>
    ipcOk({ retried: knowledgeIngestJobService.retryKnowledgeIngestJob(input) }),

  [IpcChannel.KnowledgeFileRegistryList]: async (input) =>
    ipcOk({ items: knowledgeFileRegistryService.listKnowledgeFileRegistry(input) }),

  [IpcChannel.MemoryEntryList]: async (input) =>
    ipcOk({ items: memoryEntryService.listMemoryEntries(input) }),

  [IpcChannel.MemoryEntryDelete]: async (input) => {
    const deleted = memoryEntryService.deleteMemoryEntry(input)
    return ipcOk({ deleted })
  },

  [IpcChannel.KnowledgeSourceAddNotionExport]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeNotionExportFolder(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Add Notion export failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceRemove]: async (input) => {
    const removed = knowledgeSourceService.removeKnowledgeSource(input)
    return ipcOk({ removed })
  },

  [IpcChannel.KnowledgeWatchStatus]: async (input) => {
    const data = input as { workspaceId: string; kbId: string }
    return ipcOk({
      items: knowledgeSourceService.getKnowledgeWatchStatusForKb(data.workspaceId, data.kbId),
    })
  },

  [IpcChannel.KnowledgeFolderEnsure]: async (input) => {
    try {
      const path = knowledgeFolderService.ensureWorkspaceKnowledgeFolder(input)
      return ipcOk({ path })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ensure folder failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderGet]: async (input) => {
    const path = knowledgeFolderService.getWorkspaceKnowledgeFolderPath(input)
    return ipcOk({ path })
  },

  [IpcChannel.KnowledgeFolderScanPreview]: async (input) => {
    try {
      return ipcOk(scanKnowledgeFolderPreview(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan folder failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderListFiles]: async (input) => {
    try {
      return ipcOk(listKnowledgeFolderFiles(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'List folder files failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderImportFiles]: async (input) => {
    try {
      return ipcOk(importKnowledgeFolderFiles(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import folder files failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderDeleteFile]: async (input) => {
    try {
      return ipcOk(deleteKnowledgeFolderFile(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete folder file failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeNetworkFolderEnsure]: async (input) => {
    try {
      const path = knowledgeFolderService.ensureWorkspaceNetworkKnowledgeFolder(input)
      return ipcOk({ path })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ensure network folder failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeNetworkFolderGet]: async (input) => {
    const path = knowledgeFolderService.getWorkspaceNetworkKnowledgeFolderPath(input)
    return ipcOk({ path })
  },

  [IpcChannel.KnowledgeLocalFilesFolderEnsure]: async (input) => {
    try {
      const path = knowledgeFolderService.ensureWorkspaceLocalFilesFolder(input)
      return ipcOk({ path })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ensure local files folder failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeLocalFilesFolderGet]: async (input) => {
    const path = knowledgeFolderService.getWorkspaceLocalFilesFolderPath(input)
    return ipcOk({ path })
  },

  [IpcChannel.KnowledgeDefaultFolderEnsureKb]: async (input) => {
    try {
      return ipcOk(ensureDefaultFolderKnowledgeBase(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ensure default folder kb failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFileDedupScan]: async (input) => {
    try {
      return ipcOk(await knowledgeDedupService.scanDuplicateFiles(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan failed'
      if (message === '扫描已取消') {
        return ipcErr({ code: 'ABORTED', message, retryable: true })
      }
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFileDedupScanCancel]: async (input) =>
    ipcOk({ cancelled: knowledgeDedupService.cancelDedupScan(input) }),

  [IpcChannel.KnowledgeFileDedupDelete]: async (input) => {
    try {
      return ipcOk(knowledgeDedupService.deleteDuplicateFiles(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BlobUpload]: async (input) => {
    try {
      const data = BlobUploadInputSchema.parse(input)
      const record = writeBlobFromPath(data.sourcePath)
      return ipcOk(record)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BlobGetMeta]: async (input) => {
    const data = BlobGetMetaInputSchema.parse(input)
    const meta = getBlobMeta(data.hash)
    if (!meta) return ipcErr({ code: 'NOT_FOUND', message: 'Blob not found', retryable: false })
    return ipcOk(meta)
  },

  [IpcChannel.BlobGetDataUrl]: async (input) => {
    try {
      const data = BlobGetDataUrlInputSchema.parse(input)
      const dataUrl = getBlobDataUrl(data.hash)
      return ipcOk({ dataUrl })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Read blob failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AgentToolApprovalRespond]: async (input) => {
    const data = ToolApprovalRespondInputSchema.parse(input)
    return ipcOk({ responded: respondToolApproval(data.requestId, data.approved) })
  },

  [IpcChannel.WorkspaceList]: async () => ipcOk(workspaceService.listWorkspaces()),

  [IpcChannel.WorkspaceGetDefault]: async () => {
    const workspace = workspaceService.getDefaultWorkspace()
    if (!workspace) {
      return ipcErr({ code: 'NOT_FOUND', message: 'Default workspace not found', retryable: false })
    }
    return ipcOk(workspace)
  },

  [IpcChannel.WorkspaceGet]: async (input) => {
    const workspace = workspaceService.getWorkspace(input)
    if (!workspace) return ipcErr({ code: 'NOT_FOUND', message: 'Workspace not found', retryable: false })
    return ipcOk(workspace)
  },

  [IpcChannel.WorkspaceUpdate]: async (input) => {
    const workspace = workspaceService.updateWorkspace(input)
    if (!workspace) return ipcErr({ code: 'NOT_FOUND', message: 'Workspace not found', retryable: false })
    return ipcOk(workspace)
  },

  [IpcChannel.IdentityGet]: async () => {
    try {
      return ipcOk(identityService.getIdentityProfile())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load identity'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.IdentityUpdate]: async (input) => {
    try {
      return ipcOk(identityService.updateIdentityProfile(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update identity'
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthGetSession]: async () => {
    try {
      return ipcOk(authSessionService.getAuthSession())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load auth session'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthLogin]: async (input) => {
    try {
      const session = await authLoginService.loginAuth(AuthLoginInputSchema.parse(input))
      return ipcOk({ session })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed'
      if (error instanceof AuthLoginError && message.includes('尚未实现')) {
        return ipcErr({ code: AUTH_ERROR_CODES.NOT_IMPLEMENTED, message, retryable: false })
      }
      if (error instanceof AuthLoginError && message.includes('未配置')) {
        return ipcErr({ code: AUTH_ERROR_CODES.NOT_CONFIGURED, message, retryable: false })
      }
      if (error instanceof AuthMergeRequiredError) {
        return ipcErr({
          code: AUTH_ERROR_CODES.MERGE_REQUIRED,
          message,
          details: AuthMergeRequiredDetailsSchema.parse({
            mergeToken: error.mergeToken,
            maskedPhone: error.maskedPhone,
            wechatLabel: error.wechatLabel,
          }),
          retryable: false,
        })
      }
      const code = message.includes('尚未实现') ? AUTH_ERROR_CODES.NOT_IMPLEMENTED : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthLogout]: async (input) => {
    try {
      AuthLogoutInputSchema.parse(input ?? {})
      return ipcOk({ session: authSessionService.logoutAuthSession() })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthDeleteAccount]: async (input) => {
    try {
      const session = await deleteAuthAccountRemote(AuthDeleteAccountInputSchema.parse(input))
      return ipcOk({ session })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete account failed'
      const code = message.includes('再次验证')
        ? AUTH_ERROR_CODES.REAUTH_REQUIRED
        : message.includes('尚未实现')
          ? AUTH_ERROR_CODES.NOT_IMPLEMENTED
          : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthVerifyDeleteReauth]: async (input) => {
    try {
      return ipcOk(await verifyDeleteAccountReauth(AuthVerifyDeleteReauthInputSchema.parse(input)))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reauth verification failed'
      const code = message.includes('未配置') ? AUTH_ERROR_CODES.NOT_CONFIGURED : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthGetFirebaseConfig]: async () => {
    try {
      return ipcOk(getFirebaseWebConfig())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Firebase config'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthGetTencentConfig]: async () => {
    try {
      return ipcOk(getTencentWebConfig())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load Tencent config'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthGetBuildProfile]: async () => {
    try {
      return ipcOk(getAuthBuildProfile())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load auth build profile'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthSendSmsCode]: async (input) => {
    try {
      return ipcOk(await authLoginService.sendAuthSmsCode(AuthSendSmsCodeInputSchema.parse(input)))
    } catch (error) {
      const message =
        readAuthServiceErrorMessage(error) ?? '验证码发送失败，请稍后重试'
      const code =
        error instanceof AuthLoginError && message.includes('未配置')
          ? AUTH_ERROR_CODES.NOT_CONFIGURED
          : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthResetPassword]: async (input) => {
    try {
      return ipcOk(await authLoginService.resetAuthPassword(AuthResetPasswordInputSchema.parse(input)))
    } catch (error) {
      const message = readAuthServiceErrorMessage(error) ?? '重置密码失败，请稍后重试'
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthChangePassword]: async (input) => {
    try {
      return ipcOk(await authLoginService.changeAuthPassword(AuthChangePasswordInputSchema.parse(input)))
    } catch (error) {
      const message = readAuthServiceErrorMessage(error) ?? '修改密码失败，请稍后重试'
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AuthBindProvider]: async (input) => {
    try {
      const session = await bindAuthProvider(AuthBindProviderInputSchema.parse(input))
      return ipcOk({ session })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bind provider failed'
      const code = message.includes('未配置')
        ? AUTH_ERROR_CODES.NOT_CONFIGURED
        : message.includes('尚未实现')
          ? AUTH_ERROR_CODES.NOT_IMPLEMENTED
          : 'VALIDATION_ERROR'
      return ipcErr({ code, message, retryable: false })
    }
  },

  [IpcChannel.AuthExchangeHubToken]: async (input) => {
    try {
      AuthExchangeHubTokenInputSchema.parse(input ?? {})
      const token = await exchangeAuthHubToken()
      return ipcOk(token)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hub token exchange failed'
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.DialogSelectFolder]: async (input) => selectFolder(input),
  [IpcChannel.DialogSelectFiles]: async (input) => selectFiles(input),
  [IpcChannel.DialogSelectFilesOrFolders]: async (input) => selectFilesOrFolders(input),
  [IpcChannel.DialogSaveFile]: async (input) => saveFile(input),
  [IpcChannel.FileReadForChat]: async (input) => readFilesForChat(input),
  [IpcChannel.ChatStageAttachments]: async (input) => stageChatAttachments(input),
  [IpcChannel.NotesAttachmentImport]: async (input) => importNotesAttachment(input),
  [IpcChannel.NotesSyncExport]: async (input) => exportNotesSyncFile(input),
  [IpcChannel.NotesDataSync]: async (input) => ipcOk(syncNotesData(input)),
  [IpcChannel.NotesDataLoad]: async () => ipcOk({ dataJson: getNotesDataJson() }),
  [IpcChannel.NotesGetById]: async (input) => {
    const noteId = typeof (input as { noteId?: unknown }).noteId === 'string'
      ? (input as { noteId: string }).noteId
      : ''
    const note = noteId ? getNoteById(noteId) : null
    return ipcOk({ noteJson: note ? JSON.stringify(note) : null })
  },
  [IpcChannel.NotesIngestToKb]: async (input) => {
    try {
      return ipcOk(await ingestNotesToKnowledgeBase(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ingest notes failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.SessionCreate]: async (input) => ipcOk(sessionService.createSession(input)),
  [IpcChannel.SessionList]: async (input) => ipcOk(sessionService.listSessions(input)),
  [IpcChannel.SessionGet]: async (input) => {
    const session = sessionService.getSession(input)
    if (!session) return ipcErr({ code: 'NOT_FOUND', message: 'Session not found', retryable: false })
    return ipcOk(session)
  },
  [IpcChannel.SessionUpdate]: async (input) => {
    const session = sessionService.updateSession(input)
    if (!session) return ipcErr({ code: 'NOT_FOUND', message: 'Session not found', retryable: false })
    return ipcOk(session)
  },
  [IpcChannel.SessionDelete]: async (input) => {
    const deleted = sessionService.deleteSession(input)
    return ipcOk({ deleted })
  },
  [IpcChannel.SessionFork]: async (input) => {
    try {
      const session = sessionService.forkSession(input)
      return ipcOk({ session })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fork failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.SessionClearMessages]: async (input) => {
    try {
      const cleared = sessionService.clearSessionMessages(input)
      return ipcOk({ cleared })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clear messages failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.MessageList]: async (input) => ipcOk(agentService.listMessages(input)),
  [IpcChannel.MessageSend]: async (input) => {
    try {
      return ipcOk(await agentService.sendMessage(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Send failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.MessageRegenerate]: async (input) => {
    try {
      return ipcOk(await agentService.regenerateMessage(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Regenerate failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.MessageEditUser]: async (input) => {
    try {
      return ipcOk(await agentService.editUserMessage(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Edit message failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.MessageTranslate]: async (input) => {
    try {
      return ipcOk(await agentService.translateText(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Translate failed'
      return ipcErr({
        code: 'PROVIDER_ERROR',
        message,
        retryable: error instanceof ProviderError ? error.retryable : false,
      })
    }
  },
  [IpcChannel.MessageDiagnose]: async (input) => {
    try {
      return ipcOk(await agentService.diagnoseError(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Diagnose failed'
      return ipcErr({
        code: 'PROVIDER_ERROR',
        message,
        retryable: error instanceof ProviderError ? error.retryable : false,
      })
    }
  },
  [IpcChannel.MessageAbort]: async (input) => ipcOk({ aborted: agentService.abortMessage(input) }),
  [IpcChannel.MessageAbortSession]: async (input) =>
    ipcOk({ aborted: agentService.abortSessionStreaming(input) }),

  [IpcChannel.MessageDelete]: async (input) => ipcOk({ deleted: agentService.deleteMessage(input) }),

  [IpcChannel.McpStatusList]: async (input) => ipcOk(await mcpStatusService.listMcpStatus(input)),

  [IpcChannel.McpServerList]: async () => ipcOk(mcpService.listServers()),
  [IpcChannel.McpServerUpsert]: async (input) => {
    try {
      const server = mcpService.upsertServer(input)
      return ipcOk(server)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.McpServerDelete]: async (input) => {
    try {
      return ipcOk(mcpService.removeServer(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.McpServerTest]: async (input) => ipcOk(await mcpService.testServer(input)),
  [IpcChannel.McpToolsList]: async (input) => ipcOk(await mcpService.listTools(input)),
  [IpcChannel.McpServerInspect]: async (input) => ipcOk(await mcpService.inspectServer(input)),

  [IpcChannel.SkillList]: async () => ipcOk(skillsFacade.listInstalledSkills()),
  [IpcChannel.SkillInstall]: async (input) => {
    try {
      return ipcOk(skillsFacade.installSkill(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Install failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.SkillDelete]: async (input) => {
    try {
      return ipcOk(skillsFacade.removeSkill(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.ImChannelList]: async () => ipcOk(imChannelFacade.listImChannels()),
  [IpcChannel.ImChannelUpsert]: async (input) => {
    try {
      return ipcOk(await imChannelFacade.saveImChannel(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ImChannelTest]: async (input) => {
    try {
      return ipcOk(await imChannelFacade.testImChannel(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ImChannelStatusList]: async () => ipcOk(imChannelFacade.listImChannelStatuses()),
  [IpcChannel.ImChannelWebhookInfo]: async () => ipcOk(imChannelFacade.getImChannelWebhookInfo()),

  [IpcChannel.AssistantList]: async (input) => {
    const workspaceId =
      typeof input === 'object' &&
      input != null &&
      'workspaceId' in input &&
      typeof (input as { workspaceId?: unknown }).workspaceId === 'string'
        ? (input as { workspaceId: string }).workspaceId
        : null
    if (workspaceId) {
      p2pAgentShareService.sanitizeOwnerSourceAgentMirrorFlags(workspaceId)
      p2pGroupAgentProxyService.syncGroupProxyAssistantModels(workspaceId)
    }
    return ipcOk(assistantService.listAssistants(input))
  },
  [IpcChannel.AssistantCreate]: async (input) => ipcOk(assistantService.createAssistant(input)),
  [IpcChannel.AssistantUpdate]: async (input) => {
    const assistant = assistantService.updateAssistant(input)
    if (!assistant) return ipcErr({ code: 'NOT_FOUND', message: 'Assistant not found', retryable: false })
    return ipcOk(assistant)
  },
  [IpcChannel.AssistantDelete]: async (input) => {
    try {
      const data = AssistantDeleteInputSchema.parse(input)
      const existing = assistantService.getAssistantRow(data.id)
      if (existing) {
        const rows = getSessionRepository().listRows({
          workspaceId: existing.workspaceId,
          assistantId: data.id,
          limit: 500,
        })
        for (const row of rows) {
          agentService.abortSessionStreaming({ sessionId: row.id })
        }
      }
      return ipcOk(assistantService.deleteAssistant(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.AssistantDuplicate]: async (input) => {
    const assistant = assistantService.duplicateAssistant(input)
    if (!assistant) return ipcErr({ code: 'NOT_FOUND', message: 'Assistant not found', retryable: false })
    return ipcOk(assistant)
  },

  [IpcChannel.ProviderList]: async (input) => ipcOk(providerService.listProviders(input)),
  [IpcChannel.ProviderCreate]: async (input) => ipcOk(providerService.createProvider(input)),
  [IpcChannel.ProviderUpdate]: async (input) => {
    const provider = providerService.updateProvider(input)
    if (!provider) return ipcErr({ code: 'NOT_FOUND', message: 'Provider not found', retryable: false })
    return ipcOk(provider)
  },
  [IpcChannel.ProviderTest]: async (input) => {
    try {
      return ipcOk(await providerService.testProvider(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed'
      return ipcErr({ code: 'PROVIDER_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ProviderFetchModels]: async (input) => {
    try {
      return ipcOk(await providerService.fetchProviderModels(input))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fetch models failed'
      return ipcErr({
        code: 'PROVIDER_ERROR',
        message,
        retryable: error instanceof ProviderError ? error.retryable : false,
      })
    }
  },
  [IpcChannel.ProviderDelete]: async (input) => {
    try {
      return ipcOk({ deleted: providerService.deleteProvider(input) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed'
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.P2pPing]: async () => {
    try {
      const message = P2pBridge.ping()
      const nativeVersion = P2pBridge.version()
      return ipcOk(
        P2pPingOutputSchema.parse({
          pong: true,
          message,
          nativeVersion,
        }),
      )
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'P2P native module unavailable'
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pDeviceGetInfo]: async () => {
    try {
      const info = p2pDeviceIdentityService.getP2pDeviceInfo()
      return ipcOk(P2pDeviceGetInfoOutputSchema.parse(info))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to get device identity'
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pDiscoveryStart]: async () => {
    try {
      p2pDiscoveryService.startP2pDiscovery()
      return ipcOk(P2pDiscoveryStartOutputSchema.parse({ started: true }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to start P2P discovery'
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pDiscoveryStop]: async () => {
    try {
      p2pDiscoveryService.stopP2pDiscovery()
      return ipcOk({})
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to stop P2P discovery'
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pDiscoveryListNodes]: async (input) => {
    try {
      const parsed = P2pDiscoveryListNodesInputSchema.parse(input ?? {})
      const nodes = p2pDiscoveryService.listP2pDiscoveredNodes(parsed.onlineOnly ?? false)
      return ipcOk(P2pDiscoveryListNodesOutputSchema.parse({ nodes }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list discovered nodes'
      return ipcErr({ code: 'P2P_NATIVE_UNAVAILABLE', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pConnectionConnect]: async (input) => {
    try {
      const parsed = P2pConnectionConnectInputSchema.parse(input)
      const state = await p2pConnectionService.connectP2pPeer(
        parsed.peerDeviceId,
        parsed.workspaceId,
      )
      return ipcOk(P2pConnectionConnectOutputSchema.parse({ state }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to connect peer'
      return ipcErr({ code: 'P2P_CONNECTION_FAILED', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pConnectionDisconnect]: async (input) => {
    try {
      const parsed = P2pConnectionDisconnectInputSchema.parse(input)
      await p2pConnectionService.disconnectP2pPeer(parsed.peerDeviceId)
      return ipcOk(P2pConnectionDisconnectOutputSchema.parse({ state: 'closed' }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to disconnect peer'
      return ipcErr({ code: 'P2P_CONNECTION_FAILED', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pConnectionList]: async () => {
    try {
      const connections = await p2pConnectionService.listP2pConnections()
      return ipcOk(P2pConnectionListOutputSchema.parse({ connections }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list connections'
      return ipcErr({ code: 'P2P_CONNECTION_FAILED', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNetworkGetConfig]: async () => {
    try {
      applyP2pNetworkConfig()
      return ipcOk(P2pNetworkGetConfigOutputSchema.parse({ stunServers: getP2pStunServers() }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to read network config'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNetworkSetStunServers]: async (input) => {
    try {
      const parsed = P2pNetworkSetStunServersInputSchema.parse(input)
      const stunServers = setP2pStunServers(parsed.stunServers)
      applyP2pNetworkConfig()
      return ipcOk(P2pNetworkSetStunServersOutputSchema.parse({ stunServers }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to update STUN servers'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNetworkGetSnapshot]: async () => {
    try {
      const snapshot = await getP2pNetworkSnapshot()
      return ipcOk(P2pNetworkGetSnapshotOutputSchema.parse(snapshot))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to read network snapshot'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pWorkspaceCreate]: async (input) => {
    try {
      const parsed = P2pWorkspaceCreateInputSchema.parse(input)
      const result = await p2pWorkspaceService.createP2pWorkspace(parsed)
      return ipcOk(P2pWorkspaceCreateOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to create workspace'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceList]: async (input) => {
    try {
      const parsed = P2pWorkspaceListInputSchema.parse(input ?? {})
      const filter = parsed.filter ?? 'all'
      if (filter === 'mine' || filter === 'all') {
        await p2pWorkspaceService.ensureDefaultOwnedP2pWorkspace()
      }
      const workspaces = p2pWorkspaceService.listP2pWorkspaces(filter)
      return ipcOk(P2pWorkspaceListOutputSchema.parse({ workspaces }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list workspaces'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pWorkspaceGet]: async (input) => {
    try {
      const parsed = P2pWorkspaceGetInputSchema.parse(input)
      const workspace = p2pWorkspaceService.getP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceGetOutputSchema.parse({ workspace }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to get workspace'
      const code = errMessage.includes('不存在') ? 'P2P_NOT_FOUND' : 'P2P_FORBIDDEN'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceUpdate]: async (input) => {
    try {
      const parsed = P2pWorkspaceUpdateInputSchema.parse(input)
      const workspace = p2pWorkspaceService.updateP2pWorkspace(parsed)
      return ipcOk(P2pWorkspaceUpdateOutputSchema.parse({ workspace }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to update workspace'
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceDelete]: async (input) => {
    try {
      const parsed = P2pWorkspaceDeleteInputSchema.parse(input)
      p2pWorkspaceService.deleteP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceDeleteOutputSchema.parse({ deleted: true }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to delete workspace'
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceLeave]: async (input) => {
    try {
      const parsed = P2pWorkspaceLeaveInputSchema.parse(input)
      p2pWorkspaceService.leaveP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceLeaveOutputSchema.parse({ left: true }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to leave workspace'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceGetStoragePath]: async (input) => {
    try {
      const parsed = P2pWorkspaceGetStoragePathInputSchema.parse(input)
      const storagePath = p2pWorkspaceService.getP2pWorkspaceStoragePath(parsed.id)
      return ipcOk(P2pWorkspaceGetStoragePathOutputSchema.parse({ storagePath }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to get workspace storage path'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberList]: async (input) => {
    try {
      const parsed = P2pMemberListInputSchema.parse(input)
      const members = await p2pMemberService.prepareP2pMemberList(parsed.workspaceId)
      return ipcOk(P2pMemberListOutputSchema.parse({ members }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list members'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberInvite]: async (input) => {
    try {
      const parsed = P2pMemberInviteInputSchema.parse(input)
      const result = await p2pInviteService.createP2pInvite(parsed)
      return ipcOk(P2pMemberInviteOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to create invite'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberJoin]: async (input) => {
    try {
      const parsed = P2pMemberJoinInputSchema.parse(input)
      const result = await p2pMemberService.joinP2pWorkspace(parsed)
      return ipcOk(P2pMemberJoinOutputSchema.parse(result))
    } catch (error) {
      if (error instanceof p2pMemberService.P2pMemberLimitError) {
        return ipcErr({ code: 'P2P_MEMBER_LIMIT', message: error.message, retryable: false })
      }
      if (error instanceof p2pMemberService.P2pMemberVipRequiredError) {
        return ipcErr({ code: 'P2P_MEMBER_VIP_REQUIRED', message: error.message, retryable: false })
      }
      const errMessage = error instanceof Error ? error.message : 'Failed to join workspace'
      let code: 'P2P_INVITE_EXPIRED' | 'P2P_FORBIDDEN' | 'P2P_MEMBER_LIMIT' | 'INTERNAL_ERROR' =
        'INTERNAL_ERROR'
      if (errMessage.includes('过期')) code = 'P2P_INVITE_EXPIRED'
      else if (errMessage.includes('上限')) code = 'P2P_MEMBER_LIMIT'
      else if (errMessage.includes('签名') || errMessage.includes('已是')) code = 'P2P_FORBIDDEN'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberRemove]: async (input) => {
    try {
      const parsed = P2pMemberRemoveInputSchema.parse(input)
      p2pMemberService.removeP2pMember(parsed)
      return ipcOk(P2pMemberRemoveOutputSchema.parse({ removed: true }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to remove member'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberUpdateRole]: async (input) => {
    try {
      const parsed = P2pMemberUpdateRoleInputSchema.parse(input)
      const member = p2pMemberService.updateP2pMemberRole(parsed)
      return ipcOk(P2pMemberUpdateRoleOutputSchema.parse({ member }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to update member role'
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pMemberTrustDevice]: async (input) => {
    try {
      const parsed = P2pMemberTrustDeviceInputSchema.parse(input)
      const result = p2pPeerService.trustP2pPeerDevice(parsed)
      return ipcOk(P2pMemberTrustDeviceOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to trust device'
      const code = errMessage.includes('信任') ? 'P2P_TRUST_REQUIRED' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pEventList]: async (input) => {
    try {
      const parsed = P2pEventListInputSchema.parse(input)
      const result = p2pEventService.listP2pEvents(parsed)
      return ipcOk(P2pEventListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list events'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pEventGet]: async (input) => {
    try {
      const parsed = P2pEventGetInputSchema.parse(input)
      const event = p2pEventService.getP2pEvent(parsed.eventId)
      return ipcOk(P2pEventGetOutputSchema.parse({ event }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to get event'
      const code = errMessage.includes('不存在')
        ? 'NOT_FOUND'
        : errMessage.includes('无权')
          ? 'P2P_FORBIDDEN'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncStart]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = await p2pSyncService.startP2pSync(parsed.workspaceId)
      return ipcOk(P2pSyncStartOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to start sync'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pSyncStop]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = p2pSyncService.stopP2pSync(parsed.workspaceId)
      return ipcOk(P2pSyncStopOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to stop sync'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncStatus]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = p2pSyncService.getP2pSyncStatus(parsed.workspaceId)
      return ipcOk(P2pSyncStatusOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to get sync status'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncForce]: async (input) => {
    try {
      const parsed = P2pSyncForceInputSchema.parse(input)
      const result = await p2pSyncService.forceP2pSync(
        parsed.workspaceId,
        parsed.peerDeviceId,
      )
      return ipcOk(P2pSyncForceOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to force sync'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pSyncCatchUp]: async (input) => {
    try {
      const parsed = P2pSyncCatchUpInputSchema.parse(input)
      await p2pSyncService.awaitJoinerEventCatchUp(parsed.workspaceId)
      return ipcOk(P2pSyncCatchUpOutputSchema.parse({ caughtUp: true }))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to catch up events'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pKnowledgeShare]: async (input) => {
    try {
      const parsed = P2pKnowledgeShareInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.shareP2pKnowledge(parsed)
      return ipcOk(P2pKnowledgeShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to share knowledge base'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pKnowledgeSyncDocument]: async (input) => {
    try {
      const parsed = P2pKnowledgeSyncDocumentInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.syncP2pKnowledgeDocument(parsed)
      return ipcOk(P2pKnowledgeSyncDocumentOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to sync knowledge document'
      const code = errMessage.includes('无权')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pKnowledgeRemoveDocuments]: async (input) => {
    try {
      const parsed = P2pKnowledgeRemoveDocumentsInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.removeP2pKnowledgeDocuments(parsed)
      return ipcOk(P2pKnowledgeRemoveDocumentsOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to remove shared knowledge documents'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未能移除')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pKnowledgeSetDocumentPermission]: async (input) => {
    try {
      const parsed = P2pKnowledgeSetDocumentPermissionInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.setP2pKnowledgeDocumentPermission(parsed)
      return ipcOk(P2pKnowledgeSetDocumentPermissionOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to set knowledge document permission'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pKnowledgeEnsureDocumentSaved]: async (input) => {
    try {
      const parsed = P2pKnowledgeEnsureDocumentSavedInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.ensureP2pKnowledgeDocumentSaved(parsed)
      return ipcOk(P2pKnowledgeEnsureDocumentSavedOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to save shared knowledge document'
      const code = errMessage.includes('无权') || errMessage.includes('未开放')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未同步')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pKnowledgeMaterializeDocument]: async (input) => {
    try {
      const parsed = P2pKnowledgeMaterializeDocumentInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.materializeP2pKnowledgeDocumentForOpen(parsed)
      return ipcOk(P2pKnowledgeMaterializeDocumentOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to materialize shared knowledge document'
      const code =
        errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未同步')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pAgentExportPackage]: async (input) => {
    try {
      const parsed = P2pAgentExportPackageInputSchema.parse(input)
      const result = p2pAgentShareService.exportP2pAgentPackage(parsed)
      return ipcOk(P2pAgentExportPackageOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to export agent package'
      const code = errMessage.includes('不存在')
        ? 'NOT_FOUND'
        : errMessage.includes('内置')
          ? 'P2P_FORBIDDEN'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentImportPackage]: async (input) => {
    try {
      const parsed = P2pAgentImportPackageInputSchema.parse(input)
      const result = p2pAgentShareService.importP2pAgentPackage(parsed)
      return ipcOk(P2pAgentImportPackageOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to import agent package'
      const code = errMessage.includes('不存在') ? 'NOT_FOUND' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentShare]: async (input) => {
    try {
      const parsed = P2pAgentShareInputSchema.parse(input)
      const result = await p2pAgentShareService.shareP2pAgent(parsed)
      return ipcOk(P2pAgentShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to share agent'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentRemoveSessions]: async (input) => {
    try {
      const parsed = P2pAgentRemoveSessionsInputSchema.parse(input)
      const result = await p2pAgentShareService.removeP2pAgentSessions(parsed)
      return ipcOk(P2pAgentRemoveSessionsOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to remove shared agent sessions'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未能移除')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentSetSessionPermission]: async (input) => {
    try {
      const parsed = P2pAgentSetSessionPermissionInputSchema.parse(input)
      const result = await p2pAgentShareService.setP2pAgentSessionPermission(parsed)
      return ipcOk(P2pAgentSetSessionPermissionOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to set agent session permission'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pAgentOpenSession]: async (input) => {
    try {
      const parsed = P2pAgentOpenSessionInputSchema.parse(input)
      const result = await p2pGroupAgentProxyService.openP2pGroupAgentSession(parsed)
      return ipcOk(P2pAgentOpenSessionOutputSchema.parse(result))
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to open group agent session'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('未就绪')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatList]: async (input) => {
    try {
      const parsed = P2pGroupChatListInputSchema.parse(input)
      const result = p2pGroupChatService.listP2pGroupChatMessages(parsed)
      return ipcOk(P2pGroupChatListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list group chat messages'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatSend]: async (input) => {
    try {
      const parsed = P2pGroupChatSendInputSchema.parse(input)
      const result = await p2pGroupChatService.sendP2pGroupChatMessage(parsed)
      return ipcOk(P2pGroupChatSendOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to send group chat message'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatDelete]: async (input) => {
    try {
      const parsed = P2pGroupChatDeleteInputSchema.parse(input)
      const result = p2pGroupChatService.deleteP2pGroupChatMessage(parsed)
      return ipcOk(P2pGroupChatDeleteOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to delete group chat message'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pGroupChatClear]: async (input) => {
    try {
      const parsed = P2pGroupChatClearInputSchema.parse(input)
      const result = p2pGroupChatService.clearP2pGroupChatMessages(parsed)
      return ipcOk(P2pGroupChatClearOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to clear group chat messages'
      const code = errMessage.includes('无权') || errMessage.includes('只读') || errMessage.includes('群主')
        ? 'P2P_FORBIDDEN'
        : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNoteShare]: async (input) => {
    try {
      const parsed = P2pNoteShareInputSchema.parse(input)
      const result = await p2pNoteSyncService.shareP2pNote(parsed)
      return ipcOk(
        P2pNoteShareOutputSchema.parse({ sharedResource: result.sharedResource }),
      )
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to share note'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNotePushUpdate]: async (input) => {
    try {
      const parsed = P2pNotePushUpdateInputSchema.parse(input)
      const result = await p2pNoteSyncService.pushP2pNoteUpdate(parsed)
      return ipcOk(P2pNotePushUpdateOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to push note update'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在') || errMessage.includes('尚未共享')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pNoteListShareTargets]: async (input) => {
    try {
      const parsed = P2pNoteListShareTargetsInputSchema.parse(input)
      const result = p2pNoteSyncService.listP2pNoteShareTargets(parsed.noteId)
      return ipcOk(P2pNoteListShareTargetsOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list note share targets'
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pNoteSetPermission]: async (input) => {
    try {
      const parsed = P2pNoteSetPermissionInputSchema.parse(input)
      const result = await p2pNoteSyncService.setP2pNotePermission(parsed)
      return ipcOk(
        P2pNoteSetPermissionOutputSchema.parse({ sharedResource: result.sharedResource }),
      )
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to set note permission'
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pResourceUnshare]: async (input) => {
    try {
      const parsed = P2pResourceUnshareInputSchema.parse(input)
      const resource = new P2pSharedResourceRepository(getDatabase()).findById(parsed.resourceId)
      if (!resource || resource.workspaceId !== parsed.workspaceId) {
        return ipcErr({ code: 'NOT_FOUND', message: '共享资源不存在', retryable: false })
      }
      if (resource.resourceType === 'File') {
        return ipcErr({
          code: 'NOT_FOUND',
          message: '群组独立文件共享已移除',
          retryable: false,
        })
      }
      const result =
        resource.resourceType === 'Note'
          ? await p2pNoteSyncService.unshareP2pNote(parsed)
          : resource.resourceType === 'Agent'
            ? await p2pAgentShareService.unshareP2pAgent(parsed)
            : await p2pKnowledgeSyncService.unshareP2pKnowledge(parsed)
      return ipcOk(P2pResourceUnshareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to unshare resource'
      const code = errMessage.includes('无权') || errMessage.includes('只读') || errMessage.includes('群主')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pResourceList]: async (input) => {
    try {
      const parsed = P2pResourceListInputSchema.parse(input)
      const result =
        parsed.resourceType === 'Note'
          ? p2pNoteSyncService.listP2pSharedNotes(parsed)
          : p2pKnowledgeSyncService.listP2pSharedResources(parsed)
      return ipcOk(P2pResourceListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to list shared resources'
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  ...communityHandlers,
}

export function registerIpcHandlers(): void {
  for (const [channel, handler] of Object.entries(handlers) as [IpcChannel, HandlerFn][]) {
    const guardedHandler = wrapHandlerWithAuthGate(channel, handler)
    ipcMain.handle(channel, async (_event, input) => {
      try {
        return await guardedHandler(input)
      } catch (error) {
        if (error && typeof error === 'object' && 'issues' in error) {
          return ipcErr({
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error,
            retryable: false,
          })
        }
        const gateError = mapAuthGateError(error)
        if (gateError) return gateError
        const message = error instanceof Error ? error.message : 'Unknown error'
        return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
      }
    })
  }
}
