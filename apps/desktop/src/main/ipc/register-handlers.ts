import { ipcMain } from 'electron'
import {
  toErrorMessage,
  ipcErr,
  IpcChannel,
  getIpcChannelContract,
} from '@toolman/shared'
import { ipcHandlers } from './handlers/ipc-handler-map'
import { wrapHandlerWithAuthGate, mapAuthGateError } from './auth-gate'
import { isTrustedIpcSender } from './trusted-sender'
import { logStructured } from '../services/structured-log.service'
import { PathSandboxError } from '../services/path-sandbox.service'
import { fireAndForget } from '../lib/fire-and-forget'
import type { HandlerFn } from './handlers/ipc-handler-map'

export function registerIpcHandlers(): void {
  let registered = 0
  let skipped = 0

  for (const [channel, handler] of Object.entries(ipcHandlers) as [IpcChannel, HandlerFn][]) {
    if (!channel || channel === ('undefined' as IpcChannel)) {
      skipped += 1
      logStructured('ipc', 'warn', `skip invalid channel key`)
      continue
    }
    if (typeof handler !== 'function') {
      skipped += 1
      logStructured('ipc', 'warn', `skip missing handler: ${channel}`)
      continue
    }

    const guardedHandler = wrapHandlerWithAuthGate(channel, handler)
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, input) => {
      if (!isTrustedIpcSender(event)) {
        return ipcErr({
          code: 'PERMISSION_DENIED',
          message: 'Untrusted IPC sender',
          retryable: false,
        })
      }
      try {
        const contract = getIpcChannelContract(channel)
        const parsedInput = contract ? contract.input.parse(input ?? {}) : input
        const result = await guardedHandler(parsedInput)
        if (result.ok && contract) {
          const parsedOutput = contract.output.safeParse(result.data)
          if (!parsedOutput.success) {
            logStructured('ipc', 'warn', `contract output mismatch: ${channel}`)
            return result
          }
          return { ...result, data: parsedOutput.data }
        }
        return result
      } catch (error) {
        if (error instanceof PathSandboxError) {
          return ipcErr({
            code: 'VALIDATION_ERROR',
            message: error.message,
            retryable: false,
          })
        }
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

  const requiredChannels = [
    IpcChannel.TranslationDocumentParsePages,
    IpcChannel.TranslationDocumentRenderPage,
    IpcChannel.FileReadBinary,
    IpcChannel.AssistantLibSyllabusGenerate,
  ] as const
  for (const channel of requiredChannels) {
    if (typeof ipcHandlers[channel] !== 'function') {
      logStructured('ipc', 'error', `required handler missing: ${channel}`)
    }
  }

  logStructured(
    'ipc',
    'info',
    `registered ${registered} handlers${skipped > 0 ? ` (${skipped} skipped)` : ''}`,
  )

  fireAndForget(
    'ipc',
    import('../services/copyright-provenance.service').then(({ recordProvenanceBeacon }) => {
      recordProvenanceBeacon('app.ipc.ready')
    }),
  )
}
