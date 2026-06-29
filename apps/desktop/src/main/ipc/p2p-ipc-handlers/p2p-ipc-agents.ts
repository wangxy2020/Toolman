import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
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
import * as p2pAgentShareService from '../../services/p2p/agent-share.service'
import * as p2pGroupAgentProxyService from '../../services/p2p/p2p-group-agent-proxy.service'
import * as p2pGroupChatService from '../../services/p2p/p2p-group-chat.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcAgentHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pAgentExportPackage]: async (input) => {
    try {
      const parsed = P2pAgentExportPackageInputSchema.parse(input)
      const result = p2pAgentShareService.exportP2pAgentPackage(parsed)
      return ipcOk(P2pAgentExportPackageOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to export agent package')
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
      const errMessage = toErrorMessage(error, 'Failed to import agent package')
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
      const errMessage = toErrorMessage(error, 'Failed to share agent')
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
        toErrorMessage(error, 'Failed to remove shared agent sessions')
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
        toErrorMessage(error, 'Failed to set agent session permission')
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
        toErrorMessage(error, 'Failed to open group agent session')
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
      const errMessage = toErrorMessage(error, 'Failed to list group chat messages')
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
      const errMessage = toErrorMessage(error, 'Failed to send group chat message')
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
      const errMessage = toErrorMessage(error, 'Failed to delete group chat message')
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
      const errMessage = toErrorMessage(error, 'Failed to clear group chat messages')
      const code = errMessage.includes('无权') || errMessage.includes('只读') || errMessage.includes('群主')
        ? 'P2P_FORBIDDEN'
        : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },
}
