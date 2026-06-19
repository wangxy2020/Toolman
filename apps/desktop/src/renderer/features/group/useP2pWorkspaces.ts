import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pWorkspace } from '@toolman/shared'

export function useP2pWorkspaces() {
  const [myGroups, setMyGroups] = useState<P2pWorkspace[]>([])
  const [joinedGroups, setJoinedGroups] = useState<P2pWorkspace[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(
    async (input: { name: string; description?: string }) => {
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
    [load],
  )

  const join = useCallback(
    async (input: { inviteToken: string; displayName?: string }) => {
      setError(null)
      const result = await window.api.invoke(IpcChannel.P2pMemberJoin, input)

      if (!result.ok) {
        setError(result.error.message)
        throw new Error(result.error.message)
      }

      const data = result.data as { workspace: P2pWorkspace }
      await load()
      setActiveId(data.workspace.id)
      return data.workspace
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
