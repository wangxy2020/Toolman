import type { IpcChannel } from '@toolman/shared'
import { knowledgeBaseIpcHandlers } from './knowledge-ipc-handlers/knowledge-ipc-base'
import { knowledgeFolderIpcHandlers } from './knowledge-ipc-handlers/knowledge-ipc-folders'
import { knowledgeSourceIpcHandlers } from './knowledge-ipc-handlers/knowledge-ipc-sources'
import type { HandlerFn } from './knowledge-ipc-handlers/types'

export const knowledgeIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  ...knowledgeBaseIpcHandlers,
  ...knowledgeSourceIpcHandlers,
  ...knowledgeFolderIpcHandlers,
}
