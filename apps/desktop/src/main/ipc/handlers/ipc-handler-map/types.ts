import type { IpcResult } from '@toolman/shared'

export type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>
