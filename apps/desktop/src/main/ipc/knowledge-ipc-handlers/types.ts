import type { IpcResult } from '@toolman/shared'
import type { IpcChannel } from '@toolman/shared'

export type HandlerFn = (input: unknown) => Promise<IpcResult<unknown>>
export type KnowledgeHandlerMap = Partial<Record<IpcChannel, HandlerFn>>
