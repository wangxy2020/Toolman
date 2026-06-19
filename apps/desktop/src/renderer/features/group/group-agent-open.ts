import type { P2pAgentSessionPermission } from '@toolman/shared'

export interface OpenGroupAgentSessionRequest {
  p2pWorkspaceId: string
  resourceId: string
  sourceSessionId: string
  sessionTitle: string
  groupName: string
  sharedAgentName: string
  permission: P2pAgentSessionPermission
  ownerMemberId: string
  sourceAssistantId: string
  referencedModelId: string
  isOwner: boolean
  localSessionId?: string
}
