import { P2pWorkspaceRepository } from '@toolman/db'
import { stripP2pGroupPrefixedResourceName } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getDefaultWorkspace } from '../workspace.service'

export function resolvePersonalStorageWorkspaceId(): string | null {
  return getDefaultWorkspace()?.id ?? null
}

export function resolveP2pWorkspaceName(p2pWorkspaceId: string): string | null {
  const row = new P2pWorkspaceRepository(getDatabase()).findById(p2pWorkspaceId)
  const name = row?.name?.trim()
  return name || null
}

export function stripGroupPrefixedName(p2pWorkspaceId: string, resourceName: string): string {
  return stripP2pGroupPrefixedResourceName(resolveP2pWorkspaceName(p2pWorkspaceId), resourceName)
}

export function buildGroupPrefixedName(p2pWorkspaceId: string, resourceName: string): string {
  const plainName = stripGroupPrefixedName(p2pWorkspaceId, resourceName)
  const groupName = resolveP2pWorkspaceName(p2pWorkspaceId)?.trim()
  const prefix = groupName ? `[${groupName}] ` : '[群组] '
  return `${prefix}${plainName}`
}

export function buildGroupVirtualAgentName(
  p2pWorkspaceId: string,
  agentName: string,
  groupName?: string,
): string {
  const trimmedGroup = groupName?.trim() || resolveP2pWorkspaceName(p2pWorkspaceId)?.trim()
  const prefix = trimmedGroup ? `[${trimmedGroup}] ` : '[群组] '
  if (agentName.startsWith(prefix)) return agentName
  return `${prefix}${agentName}`
}

/** Canonical proxy assistant title: strip any existing group prefix, then apply DB group name. */
export function resolveGroupProxyAssistantDisplayName(
  p2pWorkspaceId: string,
  sharedAgentName: string,
): string {
  const groupName = resolveP2pWorkspaceName(p2pWorkspaceId)?.trim()
  let plainName = sharedAgentName.trim()
  plainName = stripP2pGroupPrefixedResourceName(groupName, plainName)
  if (/^\[[^\]]+\]\s+/.test(plainName)) {
    plainName = plainName.replace(/^\[[^\]]+\]\s+/, '')
  }
  const prefix = groupName ? `[${groupName}] ` : '[群组] '
  return `${prefix}${plainName}`
}
