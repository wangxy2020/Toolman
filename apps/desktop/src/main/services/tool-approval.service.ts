import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { IpcChannel } from '@toolman/shared'

export type ToolApprovalResult = {
  approved: boolean
  timedOut?: boolean
}

const pending = new Map<string, (result: ToolApprovalResult) => void>()
const grantedScopes = new Set<string>()

export function grantToolApprovalScope(scopeKey: string): void {
  if (scopeKey.trim()) grantedScopes.add(scopeKey.trim())
}

export function hasToolApprovalScope(scopeKey: string): boolean {
  return grantedScopes.has(scopeKey.trim())
}

export function clearToolApprovalScope(scopeKey: string): void {
  grantedScopes.delete(scopeKey.trim())
}

export function buildSessionToolApprovalScopeKey(sessionId: string): string {
  return `session-tools:${sessionId}`
}

function broadcastApprovalRequest(payload: {
  requestId: string
  toolName: string
  arguments: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannel.AgentToolApprovalRequest, payload)
    }
  }
}

export async function requestToolApproval(options: {
  toolName: string
  arguments: string
}): Promise<ToolApprovalResult> {
  const requestId = randomUUID()

  return new Promise<ToolApprovalResult>((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId)
      resolve({ approved: false, timedOut: true })
    }, 120_000)

    pending.set(requestId, (result) => {
      clearTimeout(timeout)
      pending.delete(requestId)
      resolve(result)
    })

    broadcastApprovalRequest({
      requestId,
      toolName: options.toolName,
      arguments: options.arguments,
    })
  })
}

export function respondToolApproval(requestId: string, approved: boolean): boolean {
  const resolve = pending.get(requestId)
  if (!resolve) return false
  resolve({ approved })
  return true
}
