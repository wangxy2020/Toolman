import type { IpcChannel } from '@toolman/shared'
import { p2pIpcNetworkHandlers } from './p2p-ipc-handlers/p2p-ipc-network'
import { p2pIpcWorkspaceHandlers } from './p2p-ipc-handlers/p2p-ipc-workspace'
import { p2pIpcMemberHandlers } from './p2p-ipc-handlers/p2p-ipc-member'
import { p2pIpcEventHandlers } from './p2p-ipc-handlers/p2p-ipc-events'
import { p2pIpcSyncCoreHandlers } from './p2p-ipc-handlers/p2p-ipc-sync-core'
import { p2pIpcSyncContentHandlers } from './p2p-ipc-handlers/p2p-ipc-sync-content'
import { p2pIpcAgentHandlers } from './p2p-ipc-handlers/p2p-ipc-agents'
import type { HandlerFn } from './p2p-ipc-handlers/types'

export type { HandlerFn } from './p2p-ipc-handlers/types'

export const p2pIpcHandlers: Partial<Record<IpcChannel, HandlerFn>> = {
  ...p2pIpcNetworkHandlers,
  ...p2pIpcWorkspaceHandlers,
  ...p2pIpcMemberHandlers,
  ...p2pIpcEventHandlers,
  ...p2pIpcSyncCoreHandlers,
  ...p2pIpcSyncContentHandlers,
  ...p2pIpcAgentHandlers,
}
