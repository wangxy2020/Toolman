import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
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
  P2pWorkflowShareInputSchema,
  P2pWorkflowShareOutputSchema,
  P2pWorkflowListLocalOutputSchema,
} from '@toolman/shared'
import { P2pSharedResourceRepository } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import * as p2pKnowledgeSyncService from '../../services/p2p/knowledge-sync.service'
import * as p2pNoteSyncService from '../../services/p2p/note-sync.service'
import * as p2pAgentShareService from '../../services/p2p/agent-share.service'
import * as p2pWorkflowSyncService from '../../services/p2p/workflow-sync-share.service'
import { listP2pSharedResourcesForWorkspace } from '../../services/p2p/p2p-shared-resource-list.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcSyncContentHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pKnowledgeShare]: async (input) => {
    try {
      const parsed = P2pKnowledgeShareInputSchema.parse(input)
      const result = await p2pKnowledgeSyncService.shareP2pKnowledge(parsed)
      return ipcOk(P2pKnowledgeShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to share knowledge base')
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
      const errMessage = toErrorMessage(error, 'Failed to sync knowledge document')
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
        toErrorMessage(error, 'Failed to remove shared knowledge documents')
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
        toErrorMessage(error, 'Failed to set knowledge document permission')
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
        toErrorMessage(error, 'Failed to save shared knowledge document')
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
        toErrorMessage(error, 'Failed to materialize shared knowledge document')
      const code =
        errMessage.includes('不存在') || errMessage.includes('未就绪') || errMessage.includes('尚未同步')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: true })
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
      const errMessage = toErrorMessage(error, 'Failed to share note')
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
      const errMessage = toErrorMessage(error, 'Failed to push note update')
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
      const errMessage = toErrorMessage(error, 'Failed to list note share targets')
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
      const errMessage = toErrorMessage(error, 'Failed to set note permission')
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
            : resource.resourceType === 'Workflow'
              ? await p2pWorkflowSyncService.unshareP2pWorkflow(parsed)
              : await p2pKnowledgeSyncService.unshareP2pKnowledge(parsed)
      return ipcOk(P2pResourceUnshareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to unshare resource')
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
      const result = listP2pSharedResourcesForWorkspace(parsed)
      return ipcOk(P2pResourceListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list shared resources')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkflowShare]: async (input) => {
    try {
      const parsed = P2pWorkflowShareInputSchema.parse(input)
      const result = await p2pWorkflowSyncService.shareP2pWorkflow(parsed)
      return ipcOk(P2pWorkflowShareOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to share workflow')
      const code = errMessage.includes('无权') || errMessage.includes('只读')
        ? 'P2P_FORBIDDEN'
        : errMessage.includes('不存在')
          ? 'NOT_FOUND'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkflowListLocal]: async () => {
    try {
      const result = p2pWorkflowSyncService.listLocalP2pWorkflowShareTargets()
      return ipcOk(P2pWorkflowListLocalOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list local workflows')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },
}
