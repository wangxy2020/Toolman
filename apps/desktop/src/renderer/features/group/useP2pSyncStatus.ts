import { useCallback, useEffect, useState } from 'react'
import {
  IpcChannel,
  type P2pReplicationTopology,
  type P2pSequencingMode,
  type P2pSyncPeerStatus,
  type P2pSyncStatus,
} from '@toolman/shared'

import { GROUP_P2P_UI_TIMING } from './group-p2p-ui-timing'
import { useStableSyncIndicator } from './useStableSyncIndicator'

interface SyncStatusState {
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
}

const DEFAULT_STATE: SyncStatusState = {
  status: 'idle',
  error: null,
  sequencingMode: 'owner_authoritative',
  ownerOnline: true,
  replicationTopology: 'owner_star',
  meshPeersConnected: 0,
  lastEventSeq: 0,
  peers: [],
  pendingFiles: 0,
}

export function useP2pSyncStatus(workspaceId: string | null) {
  const [state, setState] = useState<SyncStatusState>(DEFAULT_STATE)

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setState(DEFAULT_STATE)
      return
    }

    const result = await window.api.invoke(IpcChannel.P2pSyncStatus, { workspaceId })
    if (!result.ok) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: result.error.message,
      }))
      return
    }

    const data = result.data as {
      status: P2pSyncStatus
      error?: string
      sequencingMode: P2pSequencingMode
      ownerOnline: boolean
      replicationTopology: P2pReplicationTopology
      meshPeersConnected: number
      lastEventSeq: number
      lastSyncAt?: number
      peers: P2pSyncPeerStatus[]
      pendingFiles: number
    }

    setState({
      status: data.status,
      error: data.error ?? null,
      sequencingMode: data.sequencingMode,
      ownerOnline: data.ownerOnline,
      replicationTopology: data.replicationTopology,
      meshPeersConnected: data.meshPeersConnected,
      lastEventSeq: data.lastEventSeq,
      lastSyncAt: data.lastSyncAt,
      peers: data.peers,
      pendingFiles: data.pendingFiles,
    })
  }, [workspaceId])

  useEffect(() => {
    setState(DEFAULT_STATE)
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!workspaceId) return

    const handleError = (payload: unknown) => {
      const data = payload as { workspaceId?: string; message?: string }
      if (data.workspaceId !== workspaceId) return
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: data.message ?? '同步失败',
      }))
    }

    const handleCompleted = (payload: unknown) => {
      const data = payload as { workspaceId?: string }
      if (data.workspaceId !== workspaceId) return
      setState((prev) => ({ ...prev, error: null }))
      void refresh()
    }

    const handleMemberActivated = (payload: unknown) => {
      const data = payload as { workspaceId?: string; activated?: boolean }
      if (data.workspaceId !== workspaceId || !data.activated) return
      setState((prev) => ({ ...prev, error: null }))
      void refresh()
    }

    const handleProgress = (payload: unknown) => {
      const data = payload as { workspaceId?: string }
      if (data.workspaceId !== workspaceId) return
      setState((prev) =>
        prev.status === 'syncing' && prev.error === null
          ? prev
          : { ...prev, status: 'syncing', error: null },
      )
    }

    const unsubError = window.api.subscribe('p2p:sync:error', handleError)
    const unsubCompleted = window.api.subscribe('p2p:sync:completed', handleCompleted)
    const unsubMember = window.api.subscribe('p2p:member:changed', handleMemberActivated)
    const unsubProgress = window.api.subscribe('p2p:sync:progress', handleProgress)

    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = (payload?: unknown) => {
      const data = payload as { workspaceId?: string } | undefined
      if (data?.workspaceId && data.workspaceId !== workspaceId) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void refresh()
      }, GROUP_P2P_UI_TIMING.syncStatusRefreshDebounceMs)
    }

    const unsubConnection = window.api.subscribe(
      'p2p:connection:state-change',
      scheduleRefresh,
    )
    const unsubOnline = window.api.subscribe('p2p:discovery:node-online', scheduleRefresh)
    const unsubOffline = window.api.subscribe('p2p:discovery:node-offline', scheduleRefresh)

    return () => {
      unsubError()
      unsubCompleted()
      unsubMember()
      unsubProgress()
      unsubConnection()
      unsubOnline()
      unsubOffline()
      if (timer) clearTimeout(timer)
    }
  }, [workspaceId, refresh])

  const showSyncIndicator = useStableSyncIndicator(state.status === 'syncing')

  return {
    ...state,
    refresh,
    isDegraded: state.sequencingMode === 'lamport_degraded',
    isMeshReplication: state.replicationTopology === 'member_mesh',
    isSyncing: state.status === 'syncing',
    showSyncIndicator,
  }
}
