import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pMember, type P2pWorkspace } from '@toolman/shared'
import { bootstrapGroupWorkspaceAfterJoin } from './group-p2p-sync-policy'

export type P2pJoinResult = {
  workspace: P2pWorkspace
  member: P2pMember
  isPending: boolean
}

export class P2pJoinError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'P2pJoinError'
    this.code = code
  }
}

interface UseP2pWorkspacesOptions {
  enabled?: boolean
}

export function useP2pWorkspaces(options: UseP2pWorkspacesOptions = {}) {
  const enabled = options.enabled ?? true
  const [myGroups, setMyGroups] = useState<P2pWorkspace[]>([])
  const [joinedGroups, setJoinedGroups] = useState<P2pWorkspace[]>([])
  const [pendingJoinIds, setPendingJoinIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [joinApprovedNotice, setJoinApprovedNotice] = useState<{ workspaceName: string } | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) {
      setMyGroups([])
      setJoinedGroups([])
      setPendingJoinIds([])
      setActiveId(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const [mineResult, joinedResult] = await Promise.all([
      window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'mine' }),
      window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'joined' }),
    ])

    setLoading(false)

    if (!mineResult.ok) {
      setError(mineResult.error.message)
      return
    }
    if (!joinedResult.ok) {
      setError(joinedResult.error.message)
      return
    }

    const parseList = (data: unknown) => {
      const parsed = data as { workspaces: P2pWorkspace[]; pendingJoinIds?: string[] }
      return {
        workspaces: parsed.workspaces,
        pendingJoinIds: parsed.pendingJoinIds ?? [],
      }
    }

    const mineParsed = parseList(mineResult.data)
    const joinedParsed = parseList(joinedResult.data)

    const mine = mineParsed.workspaces
    const joined = joinedParsed.workspaces
    const pendingIds = [...new Set([...mineParsed.pendingJoinIds, ...joinedParsed.pendingJoinIds])]

    setMyGroups(mine)
    setJoinedGroups(joined)
    setPendingJoinIds(pendingIds)
    setActiveId((current) => {
      const all = [...mine, ...joined]
      if (current && all.some((item) => item.id === current)) return current
      if (current && pendingIds.includes(current)) return null
      return mine[0]?.id ?? joined[0]?.id ?? null
    })
  }, [enabled])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(
    async (input: { name: string; description?: string }) => {
      if (!enabled) {
        throw new Error('群组功能需要注册')
      }
      setError(null)
      const result = await window.api.invoke(IpcChannel.P2pWorkspaceCreate, input)

      if (!result.ok) {
        setError(result.error.message)
        throw new Error(result.error.message)
      }

      const data = result.data as { workspace: P2pWorkspace }
      await load()
      setActiveId(data.workspace.id)
      return data.workspace
    },
    [enabled, load],
  )

  const join = useCallback(
    async (input: { inviteToken: string; displayName?: string }): Promise<P2pJoinResult> => {
      if (!enabled) {
        throw new Error('群组功能需要注册')
      }
      setError(null)
      const result = await window.api.invoke(IpcChannel.P2pMemberJoin, input)

      if (!result.ok) {
        setError(result.error.message)
        if (result.error.code === 'P2P_MEMBER_LIMIT') {
          throw new P2pJoinError(result.error.code, result.error.message)
        }
        throw new Error(result.error.message)
      }

      const data = result.data as { workspace: P2pWorkspace; member: P2pMember }
      const isPending = data.member.status === 'invited'
      await load()
      if (!isPending) {
        setActiveId(data.workspace.id)
        void bootstrapGroupWorkspaceAfterJoin(data.workspace.id)
      }
      return { ...data, isPending }
    },
    [enabled, load],
  )

  const cancelPendingJoin = useCallback(
    async (workspaceId: string) => {
      const result = await window.api.invoke(IpcChannel.P2pWorkspaceLeave, { id: workspaceId })
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      setPendingJoinIds((current) => current.filter((id) => id !== workspaceId))
      setActiveId((current) => (current === workspaceId ? null : current))
      await load()
    },
    [load],
  )

  const updateWorkspace = useCallback((workspace: P2pWorkspace) => {
    setMyGroups((current) =>
      current.map((item) => (item.id === workspace.id ? workspace : item)),
    )
    setJoinedGroups((current) =>
      current.map((item) => (item.id === workspace.id ? workspace : item)),
    )
  }, [])

  const removeWorkspace = useCallback((workspaceId: string) => {
    setMyGroups((current) => current.filter((item) => item.id !== workspaceId))
    setJoinedGroups((current) => current.filter((item) => item.id !== workspaceId))
    setActiveId((current) => (current === workspaceId ? null : current))
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handleDissolved = (payload: unknown) => {
      const data = payload as { workspaceId?: string } | undefined
      if (!data?.workspaceId) return
      setMyGroups((current) => current.filter((item) => item.id !== data.workspaceId))
      setJoinedGroups((current) => current.filter((item) => item.id !== data.workspaceId))
      setPendingJoinIds((current) => current.filter((id) => id !== data.workspaceId))
      setActiveId((current) => (current === data.workspaceId ? null : current))
      void load()
    }

    const unsubMember = window.api.subscribe('p2p:member:changed', (payload) => {
      const data = payload as { workspaceId?: string; activated?: boolean } | undefined
      if (data?.activated && data.workspaceId) {
        void (async () => {
          const workspaceResult = await window.api.invoke(IpcChannel.P2pWorkspaceGet, {
            id: data.workspaceId!,
          })
          if (workspaceResult.ok) {
            const workspace = (workspaceResult.data as { workspace: P2pWorkspace }).workspace
            setJoinApprovedNotice({ workspaceName: workspace.name })
            setActiveId(workspace.id)
            void bootstrapGroupWorkspaceAfterJoin(workspace.id)
          }
          await load()
        })()
        return
      }
      void load()
    })
    const unsubDissolved = window.api.subscribe('p2p:workspace:dissolved', handleDissolved)
    const unsubEvent = window.api.subscribe('p2p:event:appended', (payload) => {
      const event = payload as {
        resourceType?: string
        eventType?: string
        workspaceId?: string
      }
      if (
        event.resourceType === 'Workspace' &&
        event.eventType === 'Deleted' &&
        event.workspaceId
      ) {
        handleDissolved({ workspaceId: event.workspaceId })
      }
    })
    return () => {
      unsubMember()
      unsubDissolved()
      unsubEvent()
    }
  }, [enabled, load])

  const active =
    myGroups.find((item) => item.id === activeId) ??
    joinedGroups.find((item) => item.id === activeId) ??
    null

  return {
    myGroups,
    joinedGroups,
    pendingJoinIds,
    active,
    activeId,
    setActiveId,
    loading,
    error,
    setError,
    load,
    create,
    join,
    cancelPendingJoin,
    joinApprovedNotice,
    dismissJoinApprovedNotice: () => setJoinApprovedNotice(null),
    updateWorkspace,
    removeWorkspace,
  }
}
