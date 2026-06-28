import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canManageWorkspaceMembers,
  canWriteWorkspace,
  IpcChannel,
  type P2pMember,
  type P2pMemberRole,
  type P2pWorkspace,
} from '@toolman/shared'
import { bootstrapGroupWorkspaceAfterJoin } from './group-p2p-sync-policy'

interface UseP2pWorkspaceOptions {
  workspaceId: string | null
  onWorkspaceUpdated?: (workspace: P2pWorkspace) => void
  onWorkspaceInvalid?: () => void
}

export function useP2pWorkspace({
  workspaceId,
  onWorkspaceUpdated,
  onWorkspaceInvalid,
}: UseP2pWorkspaceOptions) {
  const [workspace, setWorkspace] = useState<P2pWorkspace | null>(null)
  const [members, setMembers] = useState<P2pMember[]>([])
  const [selfDeviceId, setSelfDeviceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onWorkspaceUpdatedRef = useRef(onWorkspaceUpdated)
  const onWorkspaceInvalidRef = useRef(onWorkspaceInvalid)

  useEffect(() => {
    onWorkspaceUpdatedRef.current = onWorkspaceUpdated
  }, [onWorkspaceUpdated])

  useEffect(() => {
    onWorkspaceInvalidRef.current = onWorkspaceInvalid
  }, [onWorkspaceInvalid])

  const load = useCallback(async () => {
    if (!workspaceId) {
      setWorkspace(null)
      setMembers([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const [workspaceResult, membersResult, deviceResult] = await Promise.all([
      window.api.invoke(IpcChannel.P2pWorkspaceGet, { id: workspaceId }),
      window.api.invoke(IpcChannel.P2pMemberList, { workspaceId }),
      window.api.invoke(IpcChannel.P2pDeviceGetInfo),
    ])

    setLoading(false)

    if (!workspaceResult.ok) {
      setError(workspaceResult.error.message)
      if (workspaceResult.error.message.includes('群组不存在')) {
        onWorkspaceInvalidRef.current?.()
      }
      return
    }
    if (!membersResult.ok) {
      setError(membersResult.error.message)
      if (membersResult.error.message.includes('群组不存在')) {
        onWorkspaceInvalidRef.current?.()
      }
      return
    }

    const nextWorkspace = (workspaceResult.data as { workspace: P2pWorkspace }).workspace
    if (nextWorkspace.status === 'dissolved') {
      setWorkspace(null)
      setMembers([])
      setError('群组不存在')
      onWorkspaceInvalidRef.current?.()
      return
    }
    const nextMembers = (membersResult.data as { members: P2pMember[] }).members

    setWorkspace(nextWorkspace)
    setMembers(nextMembers)
    onWorkspaceUpdatedRef.current?.(nextWorkspace)

    if (deviceResult.ok) {
      const device = deviceResult.data as { deviceId: string }
      setSelfDeviceId(device.deviceId)
    }
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return

    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefresh = (payload?: unknown) => {
      const data = payload as { workspaceId?: string } | undefined
      if (data?.workspaceId && data.workspaceId !== workspaceId) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void load()
      }, 300)
    }

    const unsubConnection = window.api.subscribe(
      'p2p:connection:state-change',
      scheduleRefresh,
    )
    const unsubOnline = window.api.subscribe('p2p:discovery:node-online', scheduleRefresh)
    const unsubOffline = window.api.subscribe('p2p:discovery:node-offline', scheduleRefresh)
    const unsubMember = window.api.subscribe('p2p:member:changed', scheduleRefresh)
    const unsubDissolved = window.api.subscribe('p2p:workspace:dissolved', (payload) => {
      const data = payload as { workspaceId?: string } | undefined
      if (data?.workspaceId && data.workspaceId !== workspaceId) return
      onWorkspaceInvalidRef.current?.()
    })
    const unsubSync = window.api.subscribe('p2p:sync:completed', scheduleRefresh)
    const unsubEvent = window.api.subscribe('p2p:event:appended', (payload) => {
      const data = payload as { resourceType?: string; workspaceId?: string } | undefined
      if (data?.resourceType === 'Member') {
        scheduleRefresh(payload)
      }
    })

    return () => {
      if (timer) clearTimeout(timer)
      unsubConnection()
      unsubOnline()
      unsubOffline()
      unsubMember()
      unsubDissolved()
      unsubSync()
      unsubEvent()
    }
  }, [workspaceId, load])

  const applyWorkspace = useCallback((nextWorkspace: P2pWorkspace) => {
    setWorkspace((current) => (current?.id === nextWorkspace.id ? nextWorkspace : current))
  }, [])

  const selfMember = useMemo(
    () => members.find((member) => member.deviceId === selfDeviceId) ?? null,
    [members, selfDeviceId],
  )

  const prevMemberStatusRef = useRef<P2pMember['status'] | null>(null)
  const [joinApprovedNotice, setJoinApprovedNotice] = useState<{ workspaceName: string } | null>(
    null,
  )

  useEffect(() => {
    const status = selfMember?.status ?? null
    if (
      workspaceId &&
      prevMemberStatusRef.current === 'invited' &&
      status === 'active'
    ) {
      setError(null)
      setJoinApprovedNotice({
        workspaceName: workspace?.name ?? '群组',
      })
      void bootstrapGroupWorkspaceAfterJoin(workspaceId)
    }
    prevMemberStatusRef.current = status
  }, [selfMember?.status, workspace?.name, workspaceId])

  useEffect(() => {
    if (!workspaceId) return

    const unsubMemberActivated = window.api.subscribe('p2p:member:changed', (payload) => {
      const data = payload as { workspaceId?: string; activated?: boolean } | undefined
      if (data?.workspaceId !== workspaceId || !data.activated) return
      setError(null)
    })

    return () => {
      unsubMemberActivated()
    }
  }, [workspaceId])

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!workspaceId) throw new Error('群组不存在')
      const result = await window.api.invoke(IpcChannel.P2pMemberRemove, {
        workspaceId,
        memberId,
      })
      if (!result.ok) throw new Error(result.error.message)
      await load()
    },
    [workspaceId, load],
  )

  const updateMemberRole = useCallback(
    async (memberId: string, role: P2pMemberRole) => {
      if (!workspaceId) throw new Error('群组不存在')
      const result = await window.api.invoke(IpcChannel.P2pMemberUpdateRole, {
        workspaceId,
        memberId,
        role,
      })
      if (!result.ok) throw new Error(result.error.message)
      await load()
    },
    [workspaceId, load],
  )

  return {
    workspace,
    members,
    selfMember,
    canManageMembers:
      selfMember?.status === 'active' && canManageWorkspaceMembers(selfMember?.role),
    canWriteWorkspace:
      selfMember?.status === 'active' && canWriteWorkspace(selfMember?.role),
    isReadonly: selfMember?.role === 'readonly',
    isOwner: selfMember?.role === 'owner',
    isMembershipPending: selfMember?.status === 'invited',
    loading,
    error,
    joinApprovedNotice,
    dismissJoinApprovedNotice: () => setJoinApprovedNotice(null),
    load,
    applyWorkspace,
    removeMember,
    updateMemberRole,
  }
}
