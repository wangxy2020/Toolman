import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pWorkspace } from '@toolman/shared'
import { bootstrapGroupWorkspaceAfterJoin } from './group-p2p-sync-policy'

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
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) {
      setMyGroups([])
      setJoinedGroups([])
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

    const mine = (mineResult.data as { workspaces: P2pWorkspace[] }).workspaces
    const joined = (joinedResult.data as { workspaces: P2pWorkspace[] }).workspaces

    setMyGroups(mine)
    setJoinedGroups(joined)
    setActiveId((current) => {
      const all = [...mine, ...joined]
      if (current && all.some((item) => item.id === current)) return current
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
    async (input: { inviteToken: string; displayName?: string }) => {
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

      const data = result.data as { workspace: P2pWorkspace }
      await load()
      setActiveId(data.workspace.id)
      await bootstrapGroupWorkspaceAfterJoin(data.workspace.id)
      return data.workspace
    },
    [enabled, load],
  )

  const updateWorkspace = useCallback((workspace: P2pWorkspace) => {
    setMyGroups((current) =>
      current.map((item) => (item.id === workspace.id ? workspace : item)),
    )
    setJoinedGroups((current) =>
      current.map((item) => (item.id === workspace.id ? workspace : item)),
    )
  }, [])

  const active =
    myGroups.find((item) => item.id === activeId) ??
    joinedGroups.find((item) => item.id === activeId) ??
    null

  return {
    myGroups,
    joinedGroups,
    active,
    activeId,
    setActiveId,
    loading,
    error,
    setError,
    load,
    create,
    join,
    updateWorkspace,
  }
}
