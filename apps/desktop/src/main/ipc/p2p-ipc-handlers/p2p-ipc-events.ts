import { toErrorMessage, IpcChannel, ipcOk, ipcErr } from '@toolman/shared'
import {
  P2pEventListInputSchema,
  P2pEventListOutputSchema,
  P2pEventGetInputSchema,
  P2pEventGetOutputSchema,
} from '@toolman/shared'
import * as p2pEventService from '../../services/p2p/p2p-event.service'
import type { P2pIpcHandlerMap } from './types'

export const p2pIpcEventHandlers: P2pIpcHandlerMap = {
  [IpcChannel.P2pEventList]: async (input) => {
    try {
      const parsed = P2pEventListInputSchema.parse(input)
      const result = p2pEventService.listP2pEvents(parsed)
      return ipcOk(P2pEventListOutputSchema.parse(result))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to list events')
      const code = errMessage.includes('无权') ? 'P2P_FORBIDDEN' : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },

  [IpcChannel.P2pEventGet]: async (input) => {
    try {
      const parsed = P2pEventGetInputSchema.parse(input)
      const event = p2pEventService.getP2pEvent(parsed.eventId)
      return ipcOk(P2pEventGetOutputSchema.parse({ event }))
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to get event')
      const code = errMessage.includes('不存在')
        ? 'NOT_FOUND'
        : errMessage.includes('无权')
          ? 'P2P_FORBIDDEN'
          : 'INTERNAL_ERROR'
      return ipcErr({ code, message: errMessage, retryable: false })
    }
  },
}
