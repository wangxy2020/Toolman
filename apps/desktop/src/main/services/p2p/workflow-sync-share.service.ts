import type { P2pSharedResource } from '@toolman/shared'
import {
  P2pResourceUnshareInputSchema,
  P2pWorkflowShareInputSchema,
} from '@toolman/shared'
import { appendP2pEvent } from './p2p-event.service'
import { getSharedResourceRepo, mapSharedResourceRow } from './knowledge-sync-shared-resource'
import {
  assertCanManageSharedResource,
  assertCanShareResource,
} from './p2p-permission.guard'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import { serializeWorkflowShareMetadata } from './p2p-workflow-share-metadata'
import { listStoredWorkflows, getStoredWorkflow } from '../community/workflow-store.service'

function buildWorkflowShareJson(workflow: ReturnType<typeof getStoredWorkflow>): string {
  if (!workflow) {
    throw new Error('工作流不存在')
  }
  return JSON.stringify({
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    engine: workflow.engine,
    graph: workflow.graph,
    graphPath: workflow.graphPath,
  })
}

export function listLocalP2pWorkflowShareTargets(): {
  workflows: Array<{ id: string; name: string; description?: string }>
} {
  return {
    workflows: listStoredWorkflows().map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
    })),
  }
}

export async function shareP2pWorkflow(rawInput: unknown): Promise<{ sharedResource: P2pSharedResource }> {
  const input = P2pWorkflowShareInputSchema.parse(rawInput)
  const member = assertCanShareResource(input.workspaceId)
  const workflow = getStoredWorkflow(input.workflowId)
  if (!workflow) {
    throw new Error('工作流不存在')
  }

  const workflowJson = buildWorkflowShareJson(workflow)
  const sharedRepo = getSharedResourceRepo()
  let resource = findSharedResourceInWorkspace(
    sharedRepo,
    input.workspaceId,
    workflow.id,
    'Workflow',
  )

  const metadataJson = serializeWorkflowShareMetadata({
    sourceWorkspaceId: input.sourceWorkspaceId,
    workflowJson,
    engine: workflow.engine,
    graphPath: workflow.graphPath,
  })

  if (!resource) {
    resource = sharedRepo.create({
      id: resolveSharedResourceId(sharedRepo, workflow.id, input.workspaceId),
      workspaceId: input.workspaceId,
      resourceType: 'Workflow',
      localResourceId: workflow.id,
      name: workflow.name,
      sharedBy: member.id,
      permission: input.permission ?? 'read',
      metadataJson,
    })
  } else if (resource.status !== 'active') {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: workflow.name,
        status: 'active',
        metadataJson,
      }) ?? resource
  } else {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: workflow.name,
        metadataJson,
      }) ?? resource
  }

  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Workflow',
    resourceId: workflow.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      workflow_id: workflow.id,
      name: workflow.name,
      workflow_json: workflowJson,
      engine: workflow.engine,
      graph_path: workflow.graphPath,
      ...(input.sourceWorkspaceId ? { source_workspace_id: input.sourceWorkspaceId } : {}),
      permission: input.permission ?? 'read',
    },
  })

  return { sharedResource: mapSharedResourceRow(resource) }
}

export async function unshareP2pWorkflow(rawInput: unknown): Promise<{ unshared: true }> {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Workflow') {
    throw new Error('只能取消共享工作流')
  }

  assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  sharedRepo.update({ id: resource.id, status: 'unshared' })

  const workflowId = resource.localResourceId ?? resource.id
  const member = assertCanShareResource(input.workspaceId)
  await appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Workflow',
    resourceId: workflowId,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: { workflow_id: workflowId },
  })

  return { unshared: true }
}
