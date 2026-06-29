import type { IpcChannel } from '@toolman/shared'
import { knowledgeIpcHandlers } from '../knowledge-ipc-handlers'
import { p2pIpcHandlers } from '../p2p-ipc-handlers'
import { communityHandlers } from '../community-handlers'
import { appIpcHandlers } from './ipc-handler-map/ipc-handler-app'
import { workspaceIpcHandlers } from './ipc-handler-map/ipc-handler-workspace'
import { dialogNotesIpcHandlers } from './ipc-handler-map/ipc-handler-dialog-notes'
import { integrationsIpcHandlers } from './ipc-handler-map/ipc-handler-integrations'
import type { HandlerFn } from './ipc-handler-map/types'

export type { HandlerFn } from './ipc-handler-map/types'

export const ipcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  ...appIpcHandlers,
  ...knowledgeIpcHandlers,
  ...workspaceIpcHandlers,
  ...dialogNotesIpcHandlers,
  ...integrationsIpcHandlers,
  ...p2pIpcHandlers,
  ...communityHandlers,
}
