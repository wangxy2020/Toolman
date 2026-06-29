import type { AgentRelayMessage, Message } from '@toolman/shared'
import { MessageStreamBuffers } from '../../message-stream-buffers'

export const AGENT_RELAY_CHANNEL = 'agent-relay'

export const RELAY_TIMEOUT_MS = 120_000

export type PendingResolver = {
  resolve: (message: AgentRelayMessage) => void
  reject: (error: Error) => void
}

export const pendingRequests = new Map<string, PendingResolver>()

export type FetchOkAssembly = {
  partCount: number
  title: string
  parts: Map<number, Message[]>
}

export const fetchOkAssemblies = new Map<string, FetchOkAssembly>()

export type ActiveOwnerRelay = {
  memberDeviceId: string
  memberSessionId: string
  memberAssistantMessageId: string
  sourceSessionId: string
  unsubscribe: () => void
}

export const activeOwnerRelays = new Map<string, ActiveOwnerRelay>()

export const relayStreamBuffers = new Map<string, MessageStreamBuffers>()
