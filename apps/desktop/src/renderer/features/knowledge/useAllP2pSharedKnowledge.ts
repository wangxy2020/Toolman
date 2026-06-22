import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pMember, type P2pSharedResource, type P2pWorkspace } from '@toolman/shared'
import { buildSharedKnowledgeId } from './knowledge-sidebar-types'

export interface SharedKnowledgeEntry {
  id: string
  p2pWorkspaceId: string
  workspaceName: string
  resource: P2pSharedResource
  sourceWorkspaceId: string | null
}

interface UseAllP2pSharedKnowledgeOptions {
  enabled?: boolean
}

export function useAllP2pSharedKnowledge(options: UseAllP2pSharedKnowledgeOptions = {}) {
  const enabled = options.enabled ?? true
  const [entries, setEntries] = useState<SharedKnowledgeEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) {
      setEntries([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [mineResult, joinedResult, deviceResult] = await Promise.all([
      window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'mine' }),
      window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'joined' }),
      window.api.invoke(IpcChannel.P2pDeviceGetInfo),
    ])

    if (!mineResult.ok) {
      setLoading(false)
      setError(mineResult.error.message)
      return
    }
    if (!joinedResult.ok) {
      setLoading(false)
      setError(joinedResult.error.message)
      return
    }

    const selfDeviceId = deviceResult.ok
      ? (deviceResult.data as { deviceId: string }).deviceId
      : null

    const workspaces = [
      ...(mineResult.data as { workspaces: P2pWorkspace[] }).workspaces,
      ...(joinedResult.data as { workspaces: P2pWorkspace[] }).workspaces,
    ]

    const resourceResults = await Promise.all(
      workspaces.map(async (workspace) => {
        const [resourceResult, memberResult] = await Promise.all([
          window.api.invoke(IpcChannel.P2pResourceList, {
            workspaceId: workspace.id,
            resourceType: 'Knowledge',
            status: 'active',
          }),
          window.api.invoke(IpcChannel.P2pMemberList, { workspaceId: workspace.id }),
        ])

        if (!resourceResult.ok) {
          return {
            workspace,
            resources: [] as P2pSharedResource[],
            selfMemberId: null as string | null,
            error: resourceResult.error.message,
          }
        }

        const members = memberResult.ok
          ? (memberResult.data as { members: P2pMember[] }).members
          : []
        const selfMember =
          selfDeviceId != null
            ? (members.find((member) => member.deviceId === selfDeviceId) ?? null)
            : null

        const data = resourceResult.data as { resources: P2pSharedResource[] }
        return {
          workspace,
          resources: data.resources,
          selfMemberId: selfMember?.id ?? null,
          error: null as string | null,
        }
      }),
    )

    const nextEntries: SharedKnowledgeEntry[] = []
    const errors: string[] = []

    for (const item of resourceResults) {
      if (item.error) {
        errors.push(item.error)
        continue
      }
      for (const resource of item.resources) {
        if (item.selfMemberId != null && resource.sharedBy === item.selfMemberId) {
          continue
        }
        nextEntries.push({
          id: buildSharedKnowledgeId(item.workspace.id, resource.id),
          p2pWorkspaceId: item.workspace.id,
          workspaceName: item.workspace.name,
          resource,
          sourceWorkspaceId: resource.sourceWorkspaceId ?? null,
        })
      }
    }

    nextEntries.sort((a, b) => {
      const group = a.workspaceName.localeCompare(b.workspaceName, 'zh-CN')
      if (group !== 0) return group
      return a.resource.name.localeCompare(b.resource.name, 'zh-CN')
    })

    setEntries(nextEntries)
    setError(errors[0] ?? null)
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!enabled) return

    const handleKnowledgeEvent = (payload: unknown) => {
      const event = payload as { resourceType?: string }
      if (event.resourceType !== 'Knowledge') return
      void load()
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleKnowledgeEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleKnowledgeEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [enabled, load])

  return {
    entries,
    loading,
    error,
    load,
  }
}
