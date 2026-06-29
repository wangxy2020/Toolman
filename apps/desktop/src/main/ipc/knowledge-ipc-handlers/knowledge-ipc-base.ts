import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import * as knowledgeService from '../../services/knowledge.service'
import * as knowledgeDocumentService from '../../services/knowledge-document.service'
import { rebuildKnowledgeFtsIndex } from '../../services/knowledge-fts.service'
import * as knowledgeFolderService from '../../services/knowledge-folder.service'
import type { KnowledgeHandlerMap } from './types'

export const knowledgeBaseIpcHandlers: KnowledgeHandlerMap = {
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
}
