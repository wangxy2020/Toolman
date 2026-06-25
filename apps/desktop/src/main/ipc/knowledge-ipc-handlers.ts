import { toErrorMessage, IpcChannel, ipcOk, ipcErr, type IpcResult } from '@toolman/shared'
import {
  BlobGetDataUrlInputSchema,
  BlobGetMetaInputSchema,
  BlobUploadInputSchema,
  ToolApprovalRespondInputSchema,
} from '@toolman/shared'
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
import * as memoryEntryService from '../services/memory-entry.service'
import { respondToolApproval } from '../services/tool-approval.service'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export const knowledgeIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
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
      const message = toErrorMessage(error, 'Create failed')
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
      const message = toErrorMessage(error, 'Ensure storage path failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeDocumentList]: async (input) =>
    ipcOk({ items: await knowledgeDocumentService.listKnowledgeDocuments(input) }),

  [IpcChannel.KnowledgeDocumentIngest]: async (input) => {
    try {
      return ipcOk(await knowledgeDocumentService.ingestKnowledgeDocuments(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Ingest failed')
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
      const message = toErrorMessage(error, 'Reindex failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeKbReindex]: async (input) => {
    try {
      return ipcOk(await knowledgeDocumentService.reindexKnowledgeBaseDocuments(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Reindex failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeFtsRebuild]: async () => {
    try {
      return ipcOk(rebuildKnowledgeFtsIndex())
    } catch (error) {
      const message = toErrorMessage(error, 'FTS rebuild failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSearch]: async (input) => {
    try {
      const items = await knowledgeDocumentService.searchKnowledge(input)
      return ipcOk({ items })
    } catch (error) {
      const message = toErrorMessage(error, 'Search failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceList]: async (input) =>
    ipcOk({ items: knowledgeSourceService.listKnowledgeSources(input) }),

  [IpcChannel.KnowledgeSourceAddFolder]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeWatchFolder(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Add folder failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceAddUrl]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeUrl(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Add URL failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.KnowledgeSourceAddSitemap]: async (input) => {
    try {
      return ipcOk(await knowledgeSourceService.addKnowledgeSitemap(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Add Sitemap failed')
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
      const message = toErrorMessage(error, 'Add Notion export failed')
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
