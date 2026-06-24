import type { CommunityResourceItem } from '@toolman/shared'

export const FEDERATION_SOURCE_LABELS: Record<
  NonNullable<CommunityResourceItem['federationSource']>,
  string
> = {
  hub: '本地 Hub',
  'hub-peer': 'Peer Hub',
  p2p: 'P2P 联邦',
}

export function getFederationSourceLabel(
  source: CommunityResourceItem['federationSource'],
): string | null {
  if (!source || source === 'hub') return null
  return FEDERATION_SOURCE_LABELS[source]
}

export function shouldShowFederationSourceBadge(
  source: CommunityResourceItem['federationSource'],
): source is NonNullable<CommunityResourceItem['federationSource']> {
  return source === 'p2p' || source === 'hub-peer'
}
