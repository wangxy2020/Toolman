import type { P2pResourceType } from '@toolman/shared'
import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { reconcileAgentSharedResources } from './p2p-agent-projection'
import { reconcileKnowledgeSharedResources } from './p2p-knowledge-projection'
import { reconcileNoteSharedResources } from './p2p-note-projection'
import { reconcileWorkflowSharedResources } from './p2p-workflow-projection'

/** 从事件流重放并更新 p2p_shared_resources（读列表前的读穿投影） */
export function reconcileP2pSharedResourcesForWorkspace(
  workspaceId: string,
  resourceType?: P2pResourceType,
): void {
  try {
    if (!resourceType || resourceType === 'Agent') {
      reconcileAgentSharedResources(workspaceId)
    }
    if (!resourceType || resourceType === 'Knowledge') {
      reconcileKnowledgeSharedResources(workspaceId)
    }
    if (!resourceType || resourceType === 'Note') {
      reconcileNoteSharedResources(workspaceId)
    }
    if (!resourceType || resourceType === 'Workflow') {
      reconcileWorkflowSharedResources(workspaceId)
    }
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `shared resource reconcile failed: ${toErrorMessage(error, String(error))}`,
    )
  }
}
