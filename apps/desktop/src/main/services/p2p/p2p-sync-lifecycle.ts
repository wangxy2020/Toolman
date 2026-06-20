import type { P2pConnectionInfo, WorkspaceEvent } from '@toolman/shared'

type LocalEventHandler = (event: WorkspaceEvent) => void
type ReconnectHandler = (workspaceId: string, peerDeviceId?: string) => void | Promise<void>
type PeerConnectedHandler = (workspaceId: string, peerDeviceId: string) => void | Promise<void>
type SnapshotHandler = (workspaceId: string) => void | Promise<void>
type ConnectionSnapshotHandler = (connections: P2pConnectionInfo[]) => void
type IncomingMessagesHandler = () => void | Promise<void>
type AgentRelayHandler = (peerDeviceId: string, data: Buffer | Uint8Array) => void | Promise<void>

let localEventHandler: LocalEventHandler | null = null
let reconnectHandler: ReconnectHandler | null = null
let peerConnectedHandler: PeerConnectedHandler | null = null
let autoSnapshotHandler: SnapshotHandler | null = null
let connectionSnapshotHandler: ConnectionSnapshotHandler | null = null
let incomingMessagesHandler: IncomingMessagesHandler | null = null
let agentRelayHandler: AgentRelayHandler | null = null

export function registerP2pSyncHandlers(handlers: {
  onLocalEventAppended?: LocalEventHandler
  onReconnect?: ReconnectHandler
  onPeerConnected?: PeerConnectedHandler
  onAutoSnapshot?: SnapshotHandler
  updateConnectionSnapshot?: ConnectionSnapshotHandler
  processIncomingMessages?: IncomingMessagesHandler
  handleAgentRelayMessage?: AgentRelayHandler
}): void {
  if (handlers.onLocalEventAppended) localEventHandler = handlers.onLocalEventAppended
  if (handlers.onReconnect) reconnectHandler = handlers.onReconnect
  if (handlers.onPeerConnected) peerConnectedHandler = handlers.onPeerConnected
  if (handlers.onAutoSnapshot) autoSnapshotHandler = handlers.onAutoSnapshot
  if (handlers.updateConnectionSnapshot) connectionSnapshotHandler = handlers.updateConnectionSnapshot
  if (handlers.processIncomingMessages) incomingMessagesHandler = handlers.processIncomingMessages
  if (handlers.handleAgentRelayMessage) agentRelayHandler = handlers.handleAgentRelayMessage
}

export function notifyLocalP2pEventAppended(event: WorkspaceEvent): void {
  queueMicrotask(() => {
    localEventHandler?.(event)
    autoSnapshotHandler?.(event.workspaceId)
  })
}

export function notifyP2pReconnect(workspaceId: string, peerDeviceId?: string): void {
  void reconnectHandler?.(workspaceId, peerDeviceId)
}

export function notifyP2pPeerConnected(workspaceId: string, peerDeviceId: string): void {
  void peerConnectedHandler?.(workspaceId, peerDeviceId)
}

export function applyP2pConnectionSnapshot(connections: P2pConnectionInfo[]): void {
  connectionSnapshotHandler?.(connections)
}

export async function processP2pIncomingMessagesFromPoll(): Promise<void> {
  await incomingMessagesHandler?.()
}

export async function dispatchP2pAgentRelayMessage(
  peerDeviceId: string,
  data: Uint8Array,
): Promise<void> {
  await agentRelayHandler?.(peerDeviceId, data)
}

export function resetP2pSyncHandlersForTests(): void {
  localEventHandler = null
  reconnectHandler = null
  peerConnectedHandler = null
  autoSnapshotHandler = null
  connectionSnapshotHandler = null
  incomingMessagesHandler = null
  agentRelayHandler = null
}
