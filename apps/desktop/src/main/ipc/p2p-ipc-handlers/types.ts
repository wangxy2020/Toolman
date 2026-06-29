import type { IpcChannel, IpcResult } from '@toolman/shared'

export type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>

export type P2pIpcHandlerMap = Partial<Record<IpcChannel, HandlerFn>>
