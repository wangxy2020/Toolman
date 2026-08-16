/**
 * Desktop → mobile P2P group list sync (changelog entityKind: p2p_group).
 * Chat, shared resources, and the WebRTC mesh stay on desktop.
 */
import type { P2pWorkspace, SyncChange } from '@toolman/shared'
import { P2pGroupSyncPayloadSchema, type P2pGroupSyncPayload } from '@toolman/shared'
import { isMobileSyncEnabled } from './mobile-sync.service'
import { appendSyncChanges } from './mobile-sync-store'
import { listWorkspaceMemberRoster } from './p2p/p2p-member-shared'
import { listP2pWorkspaces } from './p2p/p2p-workspace-crud'
import { logStructured } from './structured-log.service'

function toPayload(workspace: P2pWorkspace): P2pGroupSyncPayload | null {
  const parsed = P2pGroupSyncPayloadSchema.safeParse({
    name: workspace.name.trim() || '未命名群组',
    description: workspace.description?.trim() || undefined,
    createdAt: workspace.createdAt,
    memberCount: workspace.memberCount,
    members: listWorkspaceMemberRoster(workspace.id),
    ownerIdentityId: workspace.ownerIdentityId,
    ownerDeviceId: workspace.ownerDeviceId,
  })
  return parsed.success ? parsed.data : null
}

export function publishP2pGroupSyncChange(workspace: P2pWorkspace): void {
  if (!isMobileSyncEnabled()) return
  const payload = toPayload(workspace)
  if (!payload) return
  appendSyncChanges([
    {
      entityKind: 'p2p_group',
      entityId: workspace.id,
      op: 'upsert',
      updatedAt: workspace.updatedAt,
      payload,
    },
  ])
}

export function publishP2pGroupDeleteSyncChange(
  workspaceId: string,
  updatedAt = Date.now(),
): void {
  if (!isMobileSyncEnabled()) return
  appendSyncChanges([
    {
      entityKind: 'p2p_group',
      entityId: workspaceId,
      op: 'delete',
      updatedAt,
      payload: {},
    },
  ])
}

export function publishActiveP2pGroups(): number {
  if (!isMobileSyncEnabled()) return 0
  let published = 0
  try {
    for (const workspace of listP2pWorkspaces('all')) {
      const payload = toPayload(workspace)
      if (!payload) continue
      const change: SyncChange = {
        entityKind: 'p2p_group',
        entityId: workspace.id,
        op: 'upsert',
        updatedAt: workspace.updatedAt,
        payload,
      }
      appendSyncChanges([change])
      published += 1
    }
  } catch (error) {
    logStructured(
      'mobile-sync',
      'warn',
      `p2p group publish skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return published
}

export function seedP2pGroupSyncChanges(): number {
  return publishActiveP2pGroups()
}
