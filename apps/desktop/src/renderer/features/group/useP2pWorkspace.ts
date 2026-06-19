import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canManageWorkspaceMembers,
  canWriteWorkspace,
  IpcChannel,
  type P2pMember,
  type P2pMemberRole,
  type P2pWorkspace,
} from '@toolman/shared'

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
      if (
        workspaceResult.error.message.includes('群组不存在') ||
        workspaceResult.error.message.includes('无权访问')
      ) {
        onWorkspaceInvalidRef.current?.()
      }
      return
    }
    if (!membersResult.ok) {
      setError(membersResult.error.message)
      if (
        membersResult.error.message.includes('群组不存在') ||
        membersResult.error.message.includes('无权访问')
      ) {
        onWorkspaceInvalidRef.current?.()
      }
      return
    }

    const nextWorkspace = (workspaceResult.data as { workspace: P2pWorkspace }).workspace
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

    return () => {
      if (timer) clearTimeout(timer)
      unsubConnection()
      unsubOnline()
      unsubOffline()
    }
  }, [workspaceId, load])

  const applyWorkspace = useCallback((nextWorkspace: P2pWorkspace) => {
    setWorkspace((current) => (current?.id === nextWorkspace.id ? nextWorkspace : current))
  }, [])

  const selfMember = useMemo(
    () => members.find((member) => member.deviceId === selfDeviceId) ?? null,
    [members, selfDeviceId],
  )

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
    canManageMembers: canManageWorkspaceMembers(selfMember?.role),
    canWriteWorkspace: canWriteWorkspace(selfMember?.role),
    isReadonly: selfMember?.role === 'readonly',
    isOwner: selfMember?.role === 'owner',
    loading,
    error,
    load,
    applyWorkspace,
    removeMember,
    updateMemberRole,
  }
}
