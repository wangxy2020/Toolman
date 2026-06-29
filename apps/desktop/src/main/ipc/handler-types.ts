import type { IpcChannel, IpcResult } from '@toolman/shared'

export type IpcHandlerFn = (input: unknown) => Promise<IpcResult<unknown>>
export type IpcHandlerMap = Partial<Record<IpcChannel, IpcHandlerFn>>
