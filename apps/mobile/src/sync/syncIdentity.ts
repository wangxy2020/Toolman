export const LOCAL_ONLY_SYNC_HUB_ID = 'local-only'

/** True when this identity never completed a same-user private sync. */
export function shouldDiscardForeignPrivateWorkspace(
  localIdentityId: string | null | undefined,
  syncState: { hubIdentityId?: string | null },
): boolean {
  const stamped = syncState.hubIdentityId?.trim() ?? ''
  const local = localIdentityId?.trim() ?? ''
  if (local && stamped === local) return false
  if (stamped === LOCAL_ONLY_SYNC_HUB_ID) return false
  return true
}
