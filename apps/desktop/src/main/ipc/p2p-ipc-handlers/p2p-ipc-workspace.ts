import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
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
} from '@toolman/shared'
import * as p2pWorkspaceService from '../../services/p2p/p2p-workspace.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcWorkspaceHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pWorkspaceCreate]: async (input) => {
    try {
      const parsed = P2pWorkspaceCreateInputSchema.parse(input)
      const result = await p2pWorkspaceService.createP2pWorkspace(parsed)
      return ipcOk(P2pWorkspaceCreateOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to create workspace')
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
      return ipcOk(
        P2pWorkspaceListOutputSchema.parse({
          workspaces,
          pendingJoinIds: p2pWorkspaceService.listPendingP2pJoinRequestIds(),
        }),
      )
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list workspaces')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pWorkspaceGet]: async (input) => {
    try {
      const parsed = P2pWorkspaceGetInputSchema.parse(input)
      const workspace = p2pWorkspaceService.getP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceGetOutputSchema.parse({ workspace }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get workspace')
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
      const errMessage = toErrorMessage(error, 'Failed to update workspace')
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceDelete]: async (input) => {
    try {
      const parsed = P2pWorkspaceDeleteInputSchema.parse(input)
      await p2pWorkspaceService.deleteP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceDeleteOutputSchema.parse({ deleted: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to delete workspace')
      const code = errMessage.includes('群主') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceLeave]: async (input) => {
    try {
      const parsed = P2pWorkspaceLeaveInputSchema.parse(input)
      await p2pWorkspaceService.leaveP2pWorkspace(parsed.id)
      return ipcOk(P2pWorkspaceLeaveOutputSchema.parse({ left: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to leave workspace')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pWorkspaceGetStoragePath]: async (input) => {
    try {
      const parsed = P2pWorkspaceGetStoragePathInputSchema.parse(input)
      const storagePath = p2pWorkspaceService.getP2pWorkspaceStoragePath(parsed.id)
      return ipcOk(P2pWorkspaceGetStoragePathOutputSchema.parse({ storagePath }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get workspace storage path')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },
}
