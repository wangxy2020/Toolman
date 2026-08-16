export const LOCAL_ONLY_SYNC_HUB_ID = 'local-only'

/**
 * True when private data was previously stamped to a different account and should
 * be cleared before attaching to a new hub. Unstamped data must not be wiped —
 * a false "foreign hub" probe (e.g. desktop guest UUID vs mobile `ag-…`) used to
 * discard notes/knowledge on first sync.
 */
export function shouldDiscardForeignPrivateWorkspace(
  localIdentityId: string | null | undefined,
  syncState: { hubIdentityId?: string | null },
): boolean {
  const stamped = syncState.hubIdentityId?.trim() ?? ''
  const local = localIdentityId?.trim() ?? ''
  if (!stamped || stamped === LOCAL_ONLY_SYNC_HUB_ID) return false
  if (local && stamped === local) return false
  return Boolean(local) && stamped !== local
}
