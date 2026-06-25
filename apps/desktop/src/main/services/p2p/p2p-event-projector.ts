import type { WorkspaceEvent } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import {
  applyKnowledgeUpdatedEvent,
  projectKnowledgeDeletedEvent,
  projectKnowledgeSharedEvent,
} from './p2p-knowledge-projection'
import {
  applyAgentUpdatedEvent,
  projectAgentDeletedEvent,
  projectAgentSharedEvent,
} from './p2p-agent-projection'
import {
  applyNoteUpdatedEvent,
  projectNoteDeletedEvent,
  projectNoteSharedEvent,
} from './p2p-note-projection'
import {
  projectMemberJoinedEvent,
  projectMemberLeftEvent,
  syncWorkspaceNameFromJoinEvent,
} from './p2p-member-projection'
import { projectWorkspaceUpdatedFromEvent } from './p2p-workspace-vip-pool.service'
import { projectGroupChatEvent } from './p2p-group-chat-projector'

type EventProjector = (event: WorkspaceEvent) => void

const RESOURCE_PROJECTORS: Record<string, EventProjector> = {
  Workspace: projectWorkspaceEvent,
  Member: projectMemberEvent,
  Knowledge: projectKnowledgeEvent,
  Note: projectNoteEvent,
  Agent: projectAgentEvent,
  GroupChat: projectGroupChatEvent,
}

export function projectP2pEvent(event: WorkspaceEvent): void {
  RESOURCE_PROJECTORS[event.resourceType]?.(event)
}

function projectWorkspaceEvent(event: WorkspaceEvent): void {
  if (event.eventType === 'Updated') {
    projectWorkspaceUpdatedFromEvent(event)
  }
}

function projectMemberEvent(event: WorkspaceEvent): void {
  if (event.eventType === 'Joined') {
    syncWorkspaceNameFromJoinEvent(event)
    projectMemberJoinedEvent(event)
    return
  }
  if (event.eventType === 'Left') {
    projectMemberLeftEvent(event)
  }
}

function projectKnowledgeEvent(event: WorkspaceEvent): void {
  const handlers: Partial<Record<WorkspaceEvent['eventType'], EventProjector>> = {
    Shared: projectKnowledgeSharedEvent,
    Created: projectKnowledgeSharedEvent,
    Updated: (evt) => {
      void applyKnowledgeUpdatedEvent(evt).catch((error) => {
        logStructured('p2p', 'warn', `apply knowledge updated event failed: ${toErrorMessage(error, String(error))}`)
      })
    },
    Deleted: projectKnowledgeDeletedEvent,
  }
  handlers[event.eventType]?.(event)
}

function projectNoteEvent(event: WorkspaceEvent): void {
  const handlers: Partial<Record<WorkspaceEvent['eventType'], EventProjector>> = {
    Shared: projectNoteSharedEvent,
    Created: projectNoteSharedEvent,
    Updated: applyNoteUpdatedEvent,
    Deleted: projectNoteDeletedEvent,
  }
  handlers[event.eventType]?.(event)
}

function projectAgentEvent(event: WorkspaceEvent): void {
  const handlers: Partial<Record<WorkspaceEvent['eventType'], EventProjector>> = {
    Shared: projectAgentSharedEvent,
    Created: projectAgentSharedEvent,
    Updated: applyAgentUpdatedEvent,
    Deleted: projectAgentDeletedEvent,
  }
  handlers[event.eventType]?.(event)
}
