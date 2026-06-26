import { ipcMain } from 'electron'
import { toErrorMessage, ipcErr } from '@toolman/shared'
import { ipcHandlers } from './handlers/ipc-handler-map'
import { wrapHandlerWithAuthGate, mapAuthGateError } from './auth-gate'
import { logStructured } from '../services/structured-log.service'
import type { IpcChannel } from '@toolman/shared'
import type { HandlerFn } from './handlers/ipc-handler-map'

export function registerIpcHandlers(): void {
  let registered = 0
  let skipped = 0

  for (const [channel, handler] of Object.entries(ipcHandlers) as [IpcChannel, HandlerFn][]) {
    if (typeof handler !== 'function') {
      skipped += 1
      logStructured('ipc', 'warn', `skip missing handler: ${channel}`)
      continue
    }

    const guardedHandler = wrapHandlerWithAuthGate(channel, handler)
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, input) => {
      try {
        return await guardedHandler(input)
      } catch (error) {
        if (error && typeof error === 'object' && 'issues' in error) {
          return ipcErr({
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error,
            retryable: false,
          })
        }
        const gateError = mapAuthGateError(error)
        if (gateError) return gateError
        const message = toErrorMessage(error, 'Unknown error')
        return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
      }
    })
    registered += 1
  }

  logStructured('ipc', 'info', `registered ${registered} handlers${skipped > 0 ? ` (${skipped} skipped)` : ''}`)
}
