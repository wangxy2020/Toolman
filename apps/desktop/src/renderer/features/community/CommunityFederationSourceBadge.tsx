import type { CommunityResourceItem } from '@toolman/shared'

import {
  getFederationSourceLabel,
  shouldShowFederationSourceBadge,
} from './community-federation-utils'

interface Props {
  source: CommunityResourceItem['federationSource']
}

export function CommunityFederationSourceBadge({ source }: Props) {
  if (!shouldShowFederationSourceBadge(source)) return null

  const label = getFederationSourceLabel(source)
  if (!label) return null

  return (
    <span
      className={[
        'tm-community-federation-badge',
        source === 'hub-peer'
          ? 'tm-community-federation-badge--hub-peer'
          : 'tm-community-federation-badge--p2p',
      ].join(' ')}
      title={`来源：${label}`}
    >
      {label}
    </span>
  )
}
