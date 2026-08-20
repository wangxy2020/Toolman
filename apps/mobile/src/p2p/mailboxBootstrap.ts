import { decodeWorkspaceKeyB64, P2pMailboxSessionOutputSchema } from '@toolman/shared'
import { rosterMemberFromSync } from '../sync/groupSyncMerge'
import { applyAgentShareListings } from './agentShareListing'
import { emitMeshEvent } from './meshEvents'
import { ToolmanSyncClient } from '@toolman/sync-client'
import { getMobileSyncBaseUrl, loadSyncHubToken } from '../sync/mobileSync'
import { boundFetch } from '../sync/localNetworkFetch'
import { loadDevicePairing } from '../storage/devicePairing'
import { listPersonalMailboxBaseUrls } from '../sync/personalMailboxHubs'
import { getMailboxTarget, resumePersistedMailboxSync, startMailboxSync } from './mailboxSync'
import { listMailboxSessionHubs } from './mailboxSync-helpers'
import { localP2pClientDeviceKind } from './deviceKind'
import type { GroupWorkspace } from '../storage/groupChat'

/** One session refresh per workspace per app session — enough to stamp deviceKind. */
const refreshedMailboxSessions = new Set<string>()

export async function ensureMailboxForDesktopGroup(input: {
  workspaceId: string
  deviceId: string
  identityId?: string
  displayName?: string
  preferredHubUrl?: string
  force?: boolean
}): Promise<boolean> {
  resumePersistedMailboxSync(input.deviceId)
  const alreadyRunning = Boolean(getMailboxTarget(input.workspaceId))
  if (!input.force && alreadyRunning && refreshedMailboxSessions.has(input.workspaceId)) {
    return true
  }
  const pairing = await loadDevicePairing().catch(() => null)
  const hubs = listMailboxSessionHubs(
    input.preferredHubUrl || getMailboxTarget(input.workspaceId)?.hubUrl || getMobileSyncBaseUrl(),
    listPersonalMailboxBaseUrls(pairing),
  )
  for (const hubUrl of hubs) {
    try {
      const client = new ToolmanSyncClient({
        baseUrl: hubUrl,
        getAccessToken: async () => null,
        getSyncToken: loadSyncHubToken,
        fetchImpl: boundFetch,
      })
      const previous = getMailboxTarget(input.workspaceId)
      const session = await client.fetchMailboxSession({
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        identityId: input.identityId,
        displayName: input.displayName,
        deviceKind: localP2pClientDeviceKind(),
        inviteToken: previous?.inviteToken,
      })
      const parsed = P2pMailboxSessionOutputSchema.safeParse(session)
      if (!parsed.success) continue
      refreshedMailboxSessions.add(input.workspaceId)
      startMailboxSync({
        hubUrl,
        workspaceId: parsed.data.workspaceId,
        deviceId: input.deviceId,
        workspaceKey: decodeWorkspaceKeyB64(parsed.data.workspaceKeyB64),
        ownerDeviceId: parsed.data.ownerDeviceId ?? previous?.ownerDeviceId,
        inviteToken: previous?.inviteToken,
      })
      if (parsed.data.members && parsed.data.members.length > 0) {
        emitMeshEvent({
          type: 'roster',
          workspaceId: parsed.data.workspaceId,
          members: parsed.data.members.map((member) => rosterMemberFromSync(member)),
          ownerIdentityId: parsed.data.ownerIdentityId,
          ownerDeviceId: parsed.data.ownerDeviceId,
        })
      }
      applyAgentShareListings(parsed.data.workspaceId, parsed.data.sharedAgents)
      return true
    } catch {
      // try the next reachable Sync Hub (owner LAN, then same-computer loopback)
    }
  }
  return Boolean(getMailboxTarget(input.workspaceId))
}

function mailboxClient(hubUrl: string): ToolmanSyncClient {
  return new ToolmanSyncClient({
    baseUrl: hubUrl,
    getAccessToken: async () => null,
    getSyncToken: loadSyncHubToken,
    fetchImpl: boundFetch,
  })
}

/** Chrome / a new browser has empty localStorage; ask the owner hub which groups this account already joined. */
export async function discoverJoinedDesktopGroups(input: {
  deviceId: string
  identityId?: string
  displayName?: string
}): Promise<GroupWorkspace[]> {
  resumePersistedMailboxSync(input.deviceId)
  const pairing = await loadDevicePairing().catch(() => null)
  const hubs = listMailboxSessionHubs(getMobileSyncBaseUrl(), listPersonalMailboxBaseUrls(pairing))
  for (const hubUrl of hubs) {
    try {
      const listed = await mailboxClient(hubUrl).fetchMailboxWorkspaces({
        deviceId: input.deviceId,
        identityId: input.identityId,
        displayName: input.displayName,
        deviceKind: localP2pClientDeviceKind(),
      })
      if (listed.workspaces.length === 0) continue
      return listed.workspaces.map((item) => ({
        id: item.workspaceId,
        name: item.name,
        description: item.description,
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: item.updatedAt ?? Date.now(),
        origin: 'desktop' as const,
        ownerIdentityId: item.ownerIdentityId,
        ownerDeviceId: item.ownerDeviceId,
      }))
    } catch {
      // try the next reachable Sync Hub
    }
  }
  return []
}
