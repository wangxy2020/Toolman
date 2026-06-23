import type { WorkspaceEvent } from '@toolman/shared'
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

export function projectP2pEvent(event: WorkspaceEvent): void {
  switch (event.resourceType) {
    case 'Workspace':
      projectWorkspaceEvent(event)
      break
    case 'Member':
      projectMemberEvent(event)
      break
    case 'Knowledge':
      projectKnowledgeEvent(event)
      break
    case 'Note':
      projectNoteEvent(event)
      break
    case 'Agent':
      projectAgentEvent(event)
      break
    default:
      break
  }
}

function projectWorkspaceEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Updated':
      projectWorkspaceUpdatedFromEvent(event)
      return
    case 'Created':
    case 'Deleted':
      return
    default:
      return
  }
}

function projectMemberEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Joined':
      syncWorkspaceNameFromJoinEvent(event)
      projectMemberJoinedEvent(event)
      return
    case 'Left':
      projectMemberLeftEvent(event)
      return
    default:
      return
  }
}

function projectKnowledgeEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Shared':
    case 'Created':
      projectKnowledgeSharedEvent(event)
      return
    case 'Updated':
      void applyKnowledgeUpdatedEvent(event).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[p2p] apply knowledge updated event failed: ${message}`)
      })
      return
    case 'Deleted':
      projectKnowledgeDeletedEvent(event)
      return
    default:
      return
  }
}

function projectNoteEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Shared':
    case 'Created':
      projectNoteSharedEvent(event)
      return
    case 'Updated':
      applyNoteUpdatedEvent(event)
      return
    case 'Deleted':
      projectNoteDeletedEvent(event)
      return
    default:
      return
  }
}

function projectAgentEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Shared':
    case 'Created':
      projectAgentSharedEvent(event)
      return
    case 'Updated':
      applyAgentUpdatedEvent(event)
      return
    case 'Deleted':
      projectAgentDeletedEvent(event)
      return
    default:
      return
  }
}
