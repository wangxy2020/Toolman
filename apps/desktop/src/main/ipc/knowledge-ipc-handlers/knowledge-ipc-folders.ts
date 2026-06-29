import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
  BlobGetDataUrlInputSchema,
  BlobGetMetaInputSchema,
  BlobUploadInputSchema,
  ToolApprovalRespondInputSchema,
} from '@toolman/shared'
import { scanKnowledgeFolderPreview } from '../../services/knowledge-folder-preview.service'
import {
  deleteKnowledgeFolderFile,
  importKnowledgeFolderFiles,
  listKnowledgeFolderFiles,
} from '../../services/knowledge-folder-files.service'
import { ensureDefaultFolderKnowledgeBase } from '../../services/knowledge-default-folder-kb.service'
import * as knowledgeDedupService from '../../services/knowledge-dedup.service'
import * as knowledgeFolderService from '../../services/knowledge-folder.service'
import { getBlobMeta, getBlobDataUrl, writeBlobFromPath } from '../../services/blob.service'
import { respondToolApproval } from '../../services/tool-approval.service'
import type { KnowledgeHandlerMap } from './types'

export const knowledgeFolderIpcHandlers: KnowledgeHandlerMap = {
  [IpcChannel.KnowledgeFolderEnsure]: async (input) => {
    try {
      const path = knowledgeFolderService.ensureWorkspaceKnowledgeFolder(input)
      return ipcOk({ path })
    } catch (error) {
      const message = toErrorMessage(error, 'Ensure folder failed')
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
      const message = toErrorMessage(error, 'Scan folder failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderListFiles]: async (input) => {
    try {
      return ipcOk(listKnowledgeFolderFiles(input))
    } catch (error) {
      const message = toErrorMessage(error, 'List folder files failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderImportFiles]: async (input) => {
    try {
      return ipcOk(importKnowledgeFolderFiles(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Import folder files failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFolderDeleteFile]: async (input) => {
    try {
      return ipcOk(deleteKnowledgeFolderFile(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Delete folder file failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeNetworkFolderEnsure]: async (input) => {
    try {
      const path = knowledgeFolderService.ensureWorkspaceNetworkKnowledgeFolder(input)
      return ipcOk({ path })
    } catch (error) {
      const message = toErrorMessage(error, 'Ensure network folder failed')
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
      const message = toErrorMessage(error, 'Ensure local files folder failed')
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
      const message = toErrorMessage(error, 'Ensure default folder kb failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFileDedupScan]: async (input) => {
    try {
      return ipcOk(await knowledgeDedupService.scanDuplicateFiles(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Scan failed')
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
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.BlobUpload]: async (input) => {
    try {
      const data = BlobUploadInputSchema.parse(input)
      const record = writeBlobFromPath(data.sourcePath)
      return ipcOk(record)
    } catch (error) {
      const message = toErrorMessage(error, 'Upload failed')
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
      const message = toErrorMessage(error, 'Read blob failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.AgentToolApprovalRespond]: async (input) => {
    const data = ToolApprovalRespondInputSchema.parse(input)
    return ipcOk({ responded: respondToolApproval(data.requestId, data.approved) })
  },
}
