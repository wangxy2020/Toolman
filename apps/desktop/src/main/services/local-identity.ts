/** Default single-user local identity (also P2P dev user A / founder). */
export const DEFAULT_LOCAL_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

/** P2P dual-instance dev user B — set via scripts/p2p-dev-user-b.sh */
export const P2P_DEV_USER_B_IDENTITY_ID = '00000000-0000-4000-8000-00000000000b'

/**
 * Local Toolman identity for this app instance.
 * Override with TOOLMAN_DEV_IDENTITY_ID when running dev:p2p:a / dev:p2p:b.
 */
export function getLocalIdentityId(): string {
  const override = process.env.TOOLMAN_DEV_IDENTITY_ID?.trim()
  if (override) return override
  return DEFAULT_LOCAL_IDENTITY_ID
}
