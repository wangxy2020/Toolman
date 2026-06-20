import {
  ipcErr,
  resolveIpcAuthFeature,
  type IpcChannel,
  type IpcResult,
} from '@toolman/shared'

import { getAuthGateIpcError } from '../services/auth-feature-gate.service'

type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export function wrapHandlerWithAuthGate(channel: IpcChannel, handler: HandlerFn): HandlerFn {
  const feature = resolveIpcAuthFeature(channel)
  if (!feature) return handler

  return async (input) => {
    const gateError = getAuthGateIpcError(feature)
    if (gateError) return gateError
    return handler(input)
  }
}

export function mapAuthGateError(error: unknown): IpcResult<never> | null {
  if (error instanceof Error && error.name === 'AuthRegistrationRequiredError') {
    return ipcErr({
      code: 'AUTH_REGISTRATION_REQUIRED',
      message: error.message,
      retryable: false,
    })
  }
  return null
}
