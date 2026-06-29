import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import * as knowledgeDocumentService from '../../services/knowledge-document.service'
import * as knowledgeSourceService from '../../services/knowledge-source.service'
import * as knowledgeFileRegistryService from '../../services/knowledge-file-registry.service'
import * as knowledgeIngestJobService from '../../services/knowledge-ingest-job.service'
import * as memoryEntryService from '../../services/memory-entry.service'
import type { KnowledgeHandlerMap } from './types'

export const knowledgeSourceIpcHandlers: KnowledgeHandlerMap = {
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
}
