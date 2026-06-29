import type { AgentRelayMessage, Message } from '@toolman/shared'
import {
  RELAY_TIMEOUT_MS,
  fetchOkAssemblies,
  pendingRequests,
  type PendingResolver,
} from './state'

export function waitForRelayResponse(requestId: string): Promise<AgentRelayMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId)
      fetchOkAssemblies.delete(requestId)
      reject(new Error('群组智能体请求超时'))
    }, RELAY_TIMEOUT_MS)

    const resolver: PendingResolver = {
      resolve: (message) => {
        clearTimeout(timer)
        pendingRequests.delete(requestId)
        fetchOkAssemblies.delete(requestId)
        resolve(message)
      },
      reject: (error) => {
        clearTimeout(timer)
        pendingRequests.delete(requestId)
        fetchOkAssemblies.delete(requestId)
        reject(error)
      },
    }
    pendingRequests.set(requestId, resolver)
  })
}

export function dispatchPendingResponse(message: AgentRelayMessage): void {
  if (message.type === 'fetch_ok_part') {
    const pending = pendingRequests.get(message.requestId)
    if (!pending) return

    let assembly = fetchOkAssemblies.get(message.requestId)
    if (!assembly) {
      assembly = {
        partCount: message.partCount,
        title: message.title ?? '',
        parts: new Map(),
      }
      fetchOkAssemblies.set(message.requestId, assembly)
    }

    assembly.parts.set(message.partIndex, message.messages)
    if (message.title) {
      assembly.title = message.title
    }

    if (assembly.parts.size < message.partCount) return

    const merged: Message[] = []
    for (let index = 0; index < message.partCount; index += 1) {
      merged.push(...(assembly.parts.get(index) ?? []))
    }

    pending.resolve({
      v: 1,
      type: 'fetch_ok',
      requestId: message.requestId,
      title: assembly.title,
      messages: merged,
    })
    return
  }

  const pending = pendingRequests.get(message.requestId)
  if (!pending) return
  if (message.type === 'fetch_err' || message.type === 'send_err') {
    pending.reject(new Error(message.message))
    return
  }
  pending.resolve(message)
}
