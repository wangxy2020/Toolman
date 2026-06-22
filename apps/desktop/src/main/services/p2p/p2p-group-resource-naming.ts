import { P2pWorkspaceRepository } from '@toolman/db'
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

export function buildGroupPrefixedName(p2pWorkspaceId: string, resourceName: string): string {
  const groupName = resolveP2pWorkspaceName(p2pWorkspaceId)?.trim()
  const prefix = groupName ? `[${groupName}] ` : '[群组] '
  if (resourceName.startsWith(prefix)) return resourceName
  if (groupName && resourceName.startsWith(groupName)) return resourceName
  return `${prefix}${resourceName}`
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
