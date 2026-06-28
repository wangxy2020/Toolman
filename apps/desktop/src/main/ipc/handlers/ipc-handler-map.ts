import { toErrorMessage } from '@toolman/shared'
import {IpcChannel,
  AppGetInfoOutputSchema,
  AppGetPathsOutputSchema,
  AppProvenanceBeaconInputSchema,
  AppProvenanceBeaconOutputSchema,
  AppRestoreDataInputSchema,
  AppUpdateSetAutoInputSchema,
  AppUpdateStatusSchema,
  CrashReportSetUploadInputSchema,
  CrashReportUploadResultSchema,
  CrashReportUploadStatusSchema,
  RendererErrorReportInputSchema,
  ipcOk,
  ipcErr,
  type IpcResult } from '@toolman/shared'
import { ProviderError } from '@toolman/model-gateway'
import * as mcpStatusService from '../../services/mcp-status.service'
import * as mcpService from '../../services/mcp.service'
import * as skillsFacade from '../../services/skills-facade.service'
import * as imChannelFacade from '../../services/im-channel.facade.service'
import * as providerService from '../../services/provider.service'
import * as workspaceService from '../../services/workspace.service'
import * as identityService from '../../services/identity.service'
import { getAppInfo, getAppPaths } from '../app'
import { syncRuntimeAppSettings } from '../../services/runtime-app-settings.service'
import {
  backupAppData,
  clearAppCache,
  deleteKnowledgeFiles,
  getStorageStats,
  openPathInShell,
  revealPathInShell,
  resetAppData,
  restoreAppData,
} from '../../services/app-storage.service'
import { saveFile, selectFiles, selectFilesOrFolders, selectFolder } from '../dialog'
import { readFilesForChat } from '../../services/file-read.service'
import { stageChatAttachments } from '../../services/chat-attachment-stage.service'
import { exportNotesSyncFile, importNotesAttachment } from '../../services/notes-files.service'
import { ingestNotesToKnowledgeBase, getNoteById, getNotesDataJson, syncNotesData } from '../../services/notes-data.service'
import { authIpcHandlers } from '../auth-ipc-handlers'
import { agentIpcHandlers } from '../agent-ipc-handlers'
import { knowledgeIpcHandlers } from '../knowledge-ipc-handlers'
import { p2pIpcHandlers } from '../p2p-ipc-handlers'
import { communityHandlers } from '../community-handlers'

export type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

const handlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.AppGetInfo]: async () => ipcOk(AppGetInfoOutputSchema.parse(getAppInfo())),
  [IpcChannel.AppProvenanceBeacon]: async (input) => {
    const parsed = AppProvenanceBeaconInputSchema.parse(input)
    const { recordProvenanceBeacon } = await import('../../services/copyright-provenance.service')
    const provenance = recordProvenanceBeacon(parsed.event)
    if (parsed.event === 'app.renderer.ready') {
      const { reemitPendingTrustPromptsToRenderer } = await import(
        '../../services/p2p/p2p-peer.service'
      )
      reemitPendingTrustPromptsToRenderer()
    }
    return ipcOk(
      AppProvenanceBeaconOutputSchema.parse({
        recorded: true,
        buildId: provenance.buildId,
      }),
    )
  },
  [IpcChannel.AppGetDiagnostics]: async () => {
    try {
      const { getAppDiagnostics } = await import('../../services/app-diagnostics.service')
      return ipcOk(await getAppDiagnostics())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to collect diagnostics')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: true })
    }
  },

  [IpcChannel.AppCrashReportGetStatus]: async () => {
    const { getCrashReportUploadStatus } = await import('../../services/crash-report.service')
    return ipcOk(CrashReportUploadStatusSchema.parse(getCrashReportUploadStatus()))
  },

  [IpcChannel.AppCrashReportSetUpload]: async (input) => {
    const parsed = CrashReportSetUploadInputSchema.parse(input)
    const { setCrashReportUploadEnabled } = await import('../../services/crash-report.service')
    return ipcOk(
      CrashReportUploadStatusSchema.parse(setCrashReportUploadEnabled(parsed.uploadEnabled)),
    )
  },

  [IpcChannel.AppCrashReportUploadNow]: async () => {
    const { flushPendingCrashReports } = await import('../../services/crash-report.service')
    return ipcOk(CrashReportUploadResultSchema.parse(await flushPendingCrashReports()))
  },

  [IpcChannel.AppReportRendererError]: async (input) => {
    const parsed = RendererErrorReportInputSchema.parse(input)
    const { recordCrashReport } = await import('../../services/local-operations.service')
    const stack = [parsed.stack, parsed.componentStack].filter(Boolean).join('\n--- component ---\n')
    recordCrashReport({
      kind: 'rendererError',
      message: parsed.message,
      stack: stack || undefined,
    })
    return ipcOk({ recorded: true })
  },

  [IpcChannel.AppUpdateGetStatus]: async () => {
    const { getAppUpdateStatus } = await import('../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(getAppUpdateStatus()))
  },

  [IpcChannel.AppUpdateCheck]: async () => {
    const { checkForAppUpdate } = await import('../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(await checkForAppUpdate()))
  },

  [IpcChannel.AppUpdateDownload]: async () => {
    const { downloadAppUpdate } = await import('../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(await downloadAppUpdate()))
  },

  [IpcChannel.AppUpdateInstall]: async () => {
    const { installAppUpdate } = await import('../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(installAppUpdate()))
  },

  [IpcChannel.AppUpdateSetAuto]: async (input) => {
    const parsed = AppUpdateSetAutoInputSchema.parse(input)
    const { setAppUpdateAutoEnabled } = await import('../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(setAppUpdateAutoEnabled(parsed.autoUpdate)))
  },

  [IpcChannel.BillingListPlans]: async () => {
    try {
      const { listBillingPlans } = await import('../../services/billing/billing.service')
      return ipcOk(listBillingPlans())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to list billing plans')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BillingCreateOrder]: async (input) => {
    try {
      const { createBillingOrder } = await import('../../services/billing/billing.service')
      return ipcOk(createBillingOrder(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to create billing order')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BillingGetOrderStatus]: async (input) => {
    try {
      const { getBillingOrderStatus } = await import('../../services/billing/billing.service')
      return ipcOk(getBillingOrderStatus(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to get billing order status')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: true })
    }
  },

  [IpcChannel.BillingMockPay]: async (input) => {
    try {
      const { mockPayBillingOrder } = await import('../../services/billing/billing.service')
      const result = mockPayBillingOrder(input)
      return ipcOk(result)
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to mock pay billing order')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.AppRuntimeSettingsSync]: async (input) => {
    const patch = input as {
      documentOcrEnabled?: boolean
      defaultDocProcessorProviderId?: string | null
    }
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
      const message = toErrorMessage(error, 'Backup failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AppRestoreData]: async (input) => {
    try {
      const data = AppRestoreDataInputSchema.parse(input)
      return ipcOk(await restoreAppData(data))
    } catch (error) {
      const message = toErrorMessage(error, 'Restore failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AppResetData]: async () => ipcOk(resetAppData()),

  [IpcChannel.AppDeleteKnowledge]: async () => {
    deleteKnowledgeFiles()
    return ipcOk({ deleted: true })
  },

  ...knowledgeIpcHandlers,

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
      const message = toErrorMessage(error, 'Failed to load identity')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.IdentityUpdate]: async (input) => {
    try {
      return ipcOk(identityService.updateIdentityProfile(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to update identity')
      return ipcErr({ code: 'VALIDATION_ERROR', message, retryable: false })
    }
  },

  ...authIpcHandlers,

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
      const message = toErrorMessage(error, 'Ingest notes failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  ...agentIpcHandlers,

  [IpcChannel.McpStatusList]: async (input) => ipcOk(await mcpStatusService.listMcpStatus(input)),

  [IpcChannel.McpServerList]: async () => ipcOk(mcpService.listServers()),
  [IpcChannel.McpServerUpsert]: async (input) => {
    try {
      const server = mcpService.upsertServer(input)
      return ipcOk(server)
    } catch (error) {
      const message = toErrorMessage(error, 'Save failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.McpServerDelete]: async (input) => {
    try {
      return ipcOk(mcpService.removeServer(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Delete failed')
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
      const message = toErrorMessage(error, 'Install failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.SkillDelete]: async (input) => {
    try {
      return ipcOk(skillsFacade.removeSkill(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.ImChannelList]: async () => ipcOk(imChannelFacade.listImChannels()),
  [IpcChannel.ImChannelUpsert]: async (input) => {
    try {
      return ipcOk(await imChannelFacade.saveImChannel(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Save failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ImChannelTest]: async (input) => {
    try {
      return ipcOk(await imChannelFacade.testImChannel(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Test failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ImChannelStatusList]: async () => ipcOk(imChannelFacade.listImChannelStatuses()),
  [IpcChannel.ImChannelWebhookInfo]: async () => ipcOk(imChannelFacade.getImChannelWebhookInfo()),

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
      const message = toErrorMessage(error, 'Test failed')
      return ipcErr({ code: 'PROVIDER_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ProviderFetchModels]: async (input) => {
    try {
      return ipcOk(await providerService.fetchProviderModels(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Fetch models failed')
      return ipcErr({
        code: 'PROVIDER_ERROR',
        message,
        retryable: error instanceof ProviderError ? error.retryable : false,
      })
    }
  },
  [IpcChannel.ProviderPullModel]: async (input) => {
    try {
      return ipcOk(await providerService.pullOllamaModel(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Pull model failed')
      return ipcErr({ code: 'PROVIDER_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.ProviderDelete]: async (input) => {
    try {
      return ipcOk({ deleted: providerService.deleteProvider(input) })
    } catch (error) {
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  ...p2pIpcHandlers,

  ...communityHandlers,
}

export const ipcHandlers = handlers
