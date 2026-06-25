import type {
  P2pReplicationTopology,
  P2pSequencingMode,
  P2pSyncPeerStatus,
  P2pSyncStatus,
} from '@toolman/shared'
import type { TranslateFn } from './I18nProvider'

export function formatGroupSyncStatus(status: P2pSyncStatus, t: TranslateFn): string {
  return t(`groupPage.settings.syncStatusLabels.${status}`)
}

export function formatGroupSequencingMode(mode: P2pSequencingMode, t: TranslateFn): string {
  return mode === 'owner_authoritative'
    ? t('groupPage.settings.sequencingModes.ownerAuthoritative')
    : t('groupPage.settings.sequencingModes.lamportFallback')
}

export function formatGroupPeerState(state: P2pSyncPeerStatus['state'], t: TranslateFn): string {
  return t(`groupPage.settings.peerStates.${state}`)
}

export function formatReplicationTopologyLabel(
  topology: P2pReplicationTopology,
  t: TranslateFn,
): string {
  switch (topology) {
    case 'owner_star':
      return t('groupPage.settings.replication.ownerStar')
    case 'member_mesh':
      return t('groupPage.settings.replication.memberMesh')
    case 'offline':
      return t('groupPage.settings.replication.offline')
  }
}
