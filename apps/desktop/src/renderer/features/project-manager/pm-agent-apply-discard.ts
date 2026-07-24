/** Session-scoped “放弃” for PM agent apply footers (确定 / 跳转 / 重新应用). */

function storageKey(workspaceId: string, kind: string): string {
  return `tm-pm-agent-apply-discarded:${kind}:${workspaceId}`
}

function readSet(workspaceId: string, kind: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId, kind))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    return new Set()
  }
}

function writeSet(workspaceId: string, kind: string, set: Set<string>): void {
  try {
    sessionStorage.setItem(storageKey(workspaceId, kind), JSON.stringify([...set]))
  } catch {
    // ignore quota / private mode
  }
}

export type PmAgentApplyDiscardKind =
  | 'plan'
  | 'resourcePlan'
  | 'resourceCatalog'
  | 'costPlan'
  | 'costCatalog'

export function isPmAgentApplyDiscarded(
  workspaceId: string,
  kind: PmAgentApplyDiscardKind,
  fingerprint: string,
): boolean {
  if (!workspaceId || !fingerprint) return false
  return readSet(workspaceId, kind).has(fingerprint)
}

export function markPmAgentApplyDiscarded(
  workspaceId: string,
  kind: PmAgentApplyDiscardKind,
  fingerprint: string,
): void {
  if (!workspaceId || !fingerprint) return
  const next = readSet(workspaceId, kind)
  next.add(fingerprint)
  writeSet(workspaceId, kind, next)
}
