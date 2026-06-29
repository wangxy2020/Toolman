import { ipcErr, ipcOk, type IpcError, type IpcResult } from '@toolman/shared'
import { CommunityHttpError, humanizeCommunityFetchError } from '../../services/community/community-http.client'
import { CommunityHubUnavailableError } from '../../services/community/community-ipc.facade'

export type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export function mapCommunityError(error: unknown): IpcResult<never> {
  if (error instanceof CommunityHubUnavailableError) {
    return ipcErr({
      code: 'INTERNAL_ERROR',
      message: error.message,
      retryable: true,
    })
  }

  if (error instanceof CommunityHttpError) {
    const code: IpcError['code'] =
      error.code === 'NOT_FOUND' || error.status === 404
        ? 'NOT_FOUND'
        : error.code === 'CONFLICT' || error.status === 409
          ? 'CONFLICT'
          : error.code === 'RATE_LIMITED' || error.status === 429
            ? 'RATE_LIMITED'
            : error.code === 'VALIDATION_ERROR'
              ? 'VALIDATION_ERROR'
              : error.status === 401 || error.status === 403 || error.code === 'FORBIDDEN'
                ? 'PERMISSION_DENIED'
                : 'INTERNAL_ERROR'

    return ipcErr({
      code,
      message: error.message,
      retryable:
        error.status >= 500 || error.status === 429 || error.code === 'HUB_CONNECTION_FAILED',
    })
  }

  const message =
    error instanceof Error ? humanizeCommunityFetchError(error) : 'Community request failed'
  return ipcErr({ code: 'INTERNAL_ERROR', message, retryable: false })
}

export function communityHandler(handler: (input: unknown) => Promise<unknown>): HandlerFn {
  return async (input) => {
    try {
      return ipcOk(await handler(input))
    } catch (error) {
      return mapCommunityError(error)
    }
  }
}
