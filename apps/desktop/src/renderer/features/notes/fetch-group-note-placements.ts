import { IpcChannel } from '@toolman/shared'
import type { GroupSharedNotePlacement } from '@toolman/shared'

export async function fetchGroupNotePlacements(): Promise<{
  placements: GroupSharedNotePlacement[]
  selfMemberIdByWorkspace: Record<string, string | null>
}> {
  const [mineResult, joinedResult, deviceResult] = await Promise.all([
    window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'mine' }),
    window.api.invoke(IpcChannel.P2pWorkspaceList, { filter: 'joined' }),
    window.api.invoke(IpcChannel.P2pDeviceGetInfo),
  ])

  if (!mineResult.ok || !joinedResult.ok) {
    return { placements: [], selfMemberIdByWorkspace: {} }
  }

  const selfDeviceId = deviceResult.ok
    ? (deviceResult.data as { deviceId: string }).deviceId
    : null

  const workspaces = [
    ...(mineResult.data as { workspaces: Array<{ id: string; name: string }> }).workspaces,
    ...(joinedResult.data as { workspaces: Array<{ id: string; name: string }> }).workspaces,
  ]

  const placements: GroupSharedNotePlacement[] = []
  const selfMemberIdByWorkspace: Record<string, string | null> = {}

  const resourceResults = await Promise.all(
    workspaces.map(async (workspace) => {
      const [resourceResult, memberResult] = await Promise.all([
        window.api.invoke(IpcChannel.P2pResourceList, {
          workspaceId: workspace.id,
          resourceType: 'Note',
          status: 'active',
        }),
        window.api.invoke(IpcChannel.P2pMemberList, { workspaceId: workspace.id }),
      ])

      if (!resourceResult.ok) {
        return { workspace, resources: [], selfMemberId: null as string | null }
      }

      const members = memberResult.ok
        ? (memberResult.data as { members: Array<{ id: string; deviceId: string }> }).members
        : []
      const selfMember =
        selfDeviceId != null
          ? (members.find((member) => member.deviceId === selfDeviceId) ?? null)
          : null

      const data = resourceResult.data as {
        resources: Array<{
          id: string
          localResourceId: string | null
          sharedBy: string
        }>
      }

      return {
        workspace,
        resources: data.resources,
        selfMemberId: selfMember?.id ?? null,
      }
    }),
  )

  for (const item of resourceResults) {
    selfMemberIdByWorkspace[item.workspace.id] = item.selfMemberId
    for (const resource of item.resources) {
      const noteId = resource.localResourceId ?? resource.id
      placements.push({
        noteId,
        p2pWorkspaceId: item.workspace.id,
        workspaceName: item.workspace.name,
        sharedBy: resource.sharedBy,
      })
    }
  }

  return { placements, selfMemberIdByWorkspace }
}
