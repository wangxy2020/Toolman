import type {
  P2pReplicationTopology,
  P2pSequencingMode,
  P2pSyncPeerStatus,
  P2pSyncStatus,
  P2pWorkspace,
} from '@toolman/shared'

export interface GroupSettingsSyncStatusProps {
  status: P2pSyncStatus
  error: string | null
  sequencingMode: P2pSequencingMode
  ownerOnline: boolean
  replicationTopology: P2pReplicationTopology
  meshPeersConnected: number
  lastEventSeq: number
  lastSyncAt?: number
  peers: P2pSyncPeerStatus[]
  pendingFiles: number
  onRefresh: () => void
}

export interface GroupSettingsModalProps {
  workspace: P2pWorkspace
  workspaceName: string
  isOwner: boolean
  syncStatus: GroupSettingsSyncStatusProps
  onClose: () => void
  onWorkspaceUpdated: (workspace: P2pWorkspace) => void
  onWorkspaceLeft: () => void
}

export type SettingsTab = 'general' | 'storage' | 'danger'
export type ConfirmAction = 'leave' | 'dissolve' | null
