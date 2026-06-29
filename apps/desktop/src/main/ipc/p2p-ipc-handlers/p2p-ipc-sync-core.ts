import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
  P2pSyncWorkspaceInputSchema,
  P2pSyncStartOutputSchema,
  P2pSyncStopOutputSchema,
  P2pSyncStatusOutputSchema,
  P2pSyncForceInputSchema,
  P2pSyncForceOutputSchema,
  P2pSyncCatchUpInputSchema,
  P2pSyncCatchUpOutputSchema,
} from '@toolman/shared'
import * as p2pSyncService from '../../services/p2p/p2p-sync.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcSyncCoreHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pSyncStart]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = await p2pSyncService.startP2pSync(parsed.workspaceId)
      return ipcOk(P2pSyncStartOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to start sync')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pSyncStop]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = p2pSyncService.stopP2pSync(parsed.workspaceId)
      return ipcOk(P2pSyncStopOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to stop sync')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncStatus]: async (input) => {
    try {
      const parsed = P2pSyncWorkspaceInputSchema.parse(input)
      const result = p2pSyncService.getP2pSyncStatus(parsed.workspaceId)
      return ipcOk(P2pSyncStatusOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get sync status')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pSyncForce]: async (input) => {
    try {
      const parsed = P2pSyncForceInputSchema.parse(input)
      const result = await p2pSyncService.forceP2pSync(
        parsed.workspaceId,
        parsed.peerDeviceId,
      )
      return ipcOk(P2pSyncForceOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to force sync')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },

  [IpcChannel.P2pSyncCatchUp]: async (input) => {
    try {
      const parsed = P2pSyncCatchUpInputSchema.parse(input)
      await p2pSyncService.awaitJoinerEventCatchUp(parsed.workspaceId, {
        force: parsed.force,
      })
      return ipcOk(P2pSyncCatchUpOutputSchema.parse({ caughtUp: true }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to catch up events')
      return ipcErr({ code: 'INTERNAL_ERROR', message: errMessage, retryable: true })
    }
  },
}
