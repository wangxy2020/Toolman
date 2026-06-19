import type { WorkspaceEvent } from '@toolman/shared'
import { projectFileCreatedEvent, projectFileDeletedEvent } from './p2p-file-projection'
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
    case 'File':
      projectFileEvent(event)
      break
    default:
      break
  }
}

function projectWorkspaceEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Created':
    case 'Updated':
    case 'Deleted':
      return
    default:
      return
  }
}

function projectMemberEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Joined':
    case 'Left':
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
      void applyKnowledgeUpdatedEvent(event)
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

function projectFileEvent(event: WorkspaceEvent): void {
  switch (event.eventType) {
    case 'Created':
      projectFileCreatedEvent(event)
      return
    case 'Deleted':
      projectFileDeletedEvent(event)
      return
    default:
      return
  }
}
