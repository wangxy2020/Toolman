import type { IpcChannel, IpcResult } from '@toolman/shared'

export type IpcHandlerFn = (input: unknown) => Promise<IpcResult<unknown>>
export type IpcHandlerMap = Partial<Record<IpcChannel, IpcHandlerFn>>

export function mergeIpcHandlers(...maps: IpcHandlerMap[]): IpcHandlerMap {
  return Object.assign({}, ...maps)
}
