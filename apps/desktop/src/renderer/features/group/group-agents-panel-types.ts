import type { Assistant, P2pMember, Session } from '@toolman/shared'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'

export interface GroupAgentsPanelProps {
  p2pWorkspaceId: string
  workspaceName: string
  sourceWorkspaceId: string | null
  assistants: Assistant[]
  sessions: Session[]
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  members: P2pMember[]
  selfMemberId: string | null
  onOpenGroupAgentSession?: (request: OpenGroupAgentSessionRequest) => void | Promise<void>
  onReloadAssistants?: () => void | Promise<void>
}

export interface PendingAgentDelete {
  kind: 'agent' | 'sessions'
  groups: Array<{ resourceId: string; sessionIds: string[] }>
  message: string
}

export type AddAgentsDisabledReason = 'readonly' | 'workspace' | 'noAgents' | 'allShared' | null

export interface SessionActionMenuState {
  resource: import('@toolman/shared').P2pSharedResource
  sessionId: string
  x: number
  y: number
  align: 'bottom-start'
}
