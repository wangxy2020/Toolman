import { toErrorMessage } from '@toolman/shared'
import {
  IpcChannel,
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
} from '@toolman/shared'
import { getAppInfo, getAppPaths } from '../../app'
import { syncRuntimeAppSettings } from '../../../services/runtime-app-settings.service'
import {
  backupAppData,
  clearAppCache,
  deleteKnowledgeFiles,
  getStorageStats,
  openPathInShell,
  revealPathInShell,
  resetAppData,
  restoreAppData,
} from '../../../services/app-storage.service'
import type { HandlerFn } from './types'

export const appIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  [IpcChannel.AppGetInfo]: async () => ipcOk(AppGetInfoOutputSchema.parse(getAppInfo())),
  [IpcChannel.AppProvenanceBeacon]: async (input) => {
    const parsed = AppProvenanceBeaconInputSchema.parse(input)
    const { recordProvenanceBeacon } = await import('../../../services/copyright-provenance.service')
    const provenance = recordProvenanceBeacon(parsed.event)
    if (parsed.event === 'app.renderer.ready') {
      const { reemitPendingTrustPromptsToRenderer } = await import(
        '../../../services/p2p/p2p-peer.service'
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
      const { getAppDiagnostics } = await import('../../../services/app-diagnostics.service')
      return ipcOk(await getAppDiagnostics())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to collect diagnostics')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: true })
    }
  },

  [IpcChannel.AppCrashReportGetStatus]: async () => {
    const { getCrashReportUploadStatus } = await import('../../../services/crash-report.service')
    return ipcOk(CrashReportUploadStatusSchema.parse(getCrashReportUploadStatus()))
  },

  [IpcChannel.AppCrashReportSetUpload]: async (input) => {
    const parsed = CrashReportSetUploadInputSchema.parse(input)
    const { setCrashReportUploadEnabled } = await import('../../../services/crash-report.service')
    return ipcOk(
      CrashReportUploadStatusSchema.parse(setCrashReportUploadEnabled(parsed.uploadEnabled)),
    )
  },

  [IpcChannel.AppCrashReportUploadNow]: async () => {
    const { flushPendingCrashReports } = await import('../../../services/crash-report.service')
    return ipcOk(CrashReportUploadResultSchema.parse(await flushPendingCrashReports()))
  },

  [IpcChannel.AppReportRendererError]: async (input) => {
    const parsed = RendererErrorReportInputSchema.parse(input)
    const { recordCrashReport } = await import('../../../services/local-operations.service')
    const stack = [parsed.stack, parsed.componentStack].filter(Boolean).join('\n--- component ---\n')
    recordCrashReport({
      kind: 'rendererError',
      message: parsed.message,
      stack: stack || undefined,
    })
    return ipcOk({ recorded: true })
  },

  [IpcChannel.AppUpdateGetStatus]: async () => {
    const { getAppUpdateStatus } = await import('../../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(getAppUpdateStatus()))
  },

  [IpcChannel.AppUpdateCheck]: async () => {
    const { checkForAppUpdate } = await import('../../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(await checkForAppUpdate()))
  },

  [IpcChannel.AppUpdateDownload]: async () => {
    const { downloadAppUpdate } = await import('../../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(await downloadAppUpdate()))
  },

  [IpcChannel.AppUpdateInstall]: async () => {
    const { installAppUpdate } = await import('../../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(installAppUpdate()))
  },

  [IpcChannel.AppUpdateSetAuto]: async (input) => {
    const parsed = AppUpdateSetAutoInputSchema.parse(input)
    const { setAppUpdateAutoEnabled } = await import('../../../services/app-update.service')
    return ipcOk(AppUpdateStatusSchema.parse(setAppUpdateAutoEnabled(parsed.autoUpdate)))
  },

  [IpcChannel.BillingListPlans]: async () => {
    try {
      const { listBillingPlans } = await import('../../../services/billing/billing.service')
      return ipcOk(listBillingPlans())
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to list billing plans')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BillingCreateOrder]: async (input) => {
    try {
      const { createBillingOrder } = await import('../../../services/billing/billing.service')
      return ipcOk(createBillingOrder(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to create billing order')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BillingGetOrderStatus]: async (input) => {
    try {
      const { getBillingOrderStatus } = await import('../../../services/billing/billing.service')
      return ipcOk(getBillingOrderStatus(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to get billing order status')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: true })
    }
  },

  [IpcChannel.BillingMockPay]: async (input) => {
    try {
      const { mockPayBillingOrder } = await import('../../../services/billing/billing.service')
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
}
