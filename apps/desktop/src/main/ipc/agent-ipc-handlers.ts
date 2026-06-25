import { toErrorMessage, IpcChannel, ipcOk, ipcErr, type IpcResult } from '@toolman/shared'
import { AssistantDeleteInputSchema } from '@toolman/shared'
import { ProviderError } from '@toolman/model-gateway'
import * as sessionService from '../services/session.service'
import * as agentService from '../services/agent.service'
import * as assistantService from '../services/assistant.service'
import { getSessionRepository } from '../db/repos'
import * as p2pAgentShareService from '../services/p2p/agent-share.service'
import * as p2pGroupAgentProxyService from '../services/p2p/p2p-group-agent-proxy.service'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export const agentIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
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
      const message = toErrorMessage(error, 'Fork failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.SessionClearMessages]: async (input) => {
    try {
      const cleared = sessionService.clearSessionMessages(input)
      return ipcOk({ cleared })
    } catch (error) {
      const message = toErrorMessage(error, 'Clear messages failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },

  [IpcChannel.MessageList]: async (input) => ipcOk(agentService.listMessages(input)),
  [IpcChannel.MessageSend]: async (input) => {
    try {
      return ipcOk(await agentService.sendMessage(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Send failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.MessageRegenerate]: async (input) => {
    try {
      return ipcOk(await agentService.regenerateMessage(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Regenerate failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.MessageEditUser]: async (input) => {
    try {
      return ipcOk(await agentService.editUserMessage(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Edit message failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.MessageTranslate]: async (input) => {
    try {
      return ipcOk(await agentService.translateText(input))
    } catch (error) {
      const message = toErrorMessage(error, 'Translate failed')
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
      const message = toErrorMessage(error, 'Diagnose failed')
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
      const message = toErrorMessage(error, 'Delete failed')
      return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
    }
  },
  [IpcChannel.AssistantDuplicate]: async (input) => {
    const assistant = assistantService.duplicateAssistant(input)
    if (!assistant) return ipcErr({ code: 'NOT_FOUND', message: 'Assistant not found', retryable: false })
    return ipcOk(assistant)
  },
}
