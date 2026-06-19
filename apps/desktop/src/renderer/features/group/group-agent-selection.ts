export function agentSelectionKey(resourceId: string, sessionId: string): string {
  return `${resourceId}:${sessionId}`
}

export function parseAgentSelectionKey(key: string): {
  resourceId: string
  sessionId: string
} | null {
  const separator = key.indexOf(':')
  if (separator <= 0) return null
  return {
    resourceId: key.slice(0, separator),
    sessionId: key.slice(separator + 1),
  }
}
