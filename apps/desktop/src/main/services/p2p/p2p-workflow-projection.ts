import { P2pSharedResourceRepository } from '@toolman/db'
import type { WorkspaceEvent } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import {
  getStoredWorkflow,
  upsertStoredWorkflow,
} from '../community/workflow-store.service'
import { listWorkspaceEventsSince } from './p2p-event.service'
import {
  findSharedResourceForProjection,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import {
  readWorkflowShareMetadata,
  serializeWorkflowShareMetadata,
} from './p2p-workflow-share-metadata'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function readPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function importWorkflowPackageToLocalStore(workflowJson: string): string {
  const parsed = JSON.parse(workflowJson) as {
    id?: string
    name?: string
    description?: string
    engine?: string
    graph?: Record<string, unknown>
    graphPath?: string
  }
  const workflowId = typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : 'workflow'
  upsertStoredWorkflow({
    id: workflowId,
    name: typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : '共享工作流',
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    engine: typeof parsed.engine === 'string' && parsed.engine.length > 0 ? parsed.engine : 'langgraph',
    graph: parsed.graph && typeof parsed.graph === 'object' ? parsed.graph : {},
    graphPath:
      typeof parsed.graphPath === 'string' && parsed.graphPath.length > 0
        ? parsed.graphPath
        : 'workflow.json',
  })
  return workflowId
}

export function projectWorkflowSharedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Workflow') {
    return
  }
  if (event.eventType !== 'Shared' && event.eventType !== 'Created') {
    return
  }

  const workflowId = readPayloadString(event.payload, 'workflow_id') ?? event.resourceId
  const name = readPayloadString(event.payload, 'name') ?? '共享工作流'
  const sourceWorkspaceId = readPayloadString(event.payload, 'source_workspace_id')
  let workflowJson = readPayloadString(event.payload, 'workflow_json')

  const sharedRepo = getSharedResourceRepo()
  const existing = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    workflowId,
    'Workflow',
  )
  const existingMetadata = existing ? readWorkflowShareMetadata(existing.metadataJson) : {}

  if (!workflowJson) {
    workflowJson = existingMetadata.workflowJson
  }

  const metadataJson = serializeWorkflowShareMetadata({
    sourceWorkspaceId,
    workflowJson: workflowJson ?? '',
    engine: readPayloadString(event.payload, 'engine') ?? existingMetadata.engine,
    graphPath: readPayloadString(event.payload, 'graph_path') ?? existingMetadata.graphPath,
  })

  const resourceId =
    existing?.id ?? resolveSharedResourceId(sharedRepo, workflowId, event.workspaceId)

  let localResourceId = existing?.localResourceId ?? workflowId
  if (workflowJson) {
    try {
      localResourceId = importWorkflowPackageToLocalStore(workflowJson)
    } catch {
      // keep listing row even if local import fails
    }
  }

  if (!existing) {
    sharedRepo.create({
      id: resourceId,
      workspaceId: event.workspaceId,
      resourceType: 'Workflow',
      localResourceId,
      name,
      sharedBy: event.operatorId,
      permission: 'read',
      metadataJson,
      createdAt: new Date(event.timestamp),
      updatedAt: new Date(event.timestamp),
    })
    return
  }

  sharedRepo.update({
    id: resourceId,
    name,
    status: 'active',
    localResourceId,
    metadataJson,
  })
}

export function projectWorkflowDeletedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Workflow' || event.eventType !== 'Deleted') {
    return
  }

  const workflowId = readPayloadString(event.payload, 'workflow_id') ?? event.resourceId
  const sharedRepo = getSharedResourceRepo()
  const resource = findSharedResourceForProjection(
    sharedRepo,
    event.workspaceId,
    workflowId,
    'Workflow',
  )
  if (resource) {
    sharedRepo.update({ id: resource.id, status: 'unshared' })
  }
}

export function applyWorkflowUpdatedEvent(event: WorkspaceEvent): void {
  if (event.resourceType !== 'Workflow' || event.eventType !== 'Updated') {
    return
  }

  const workflowJson = readPayloadString(event.payload, 'workflow_json')
  if (!workflowJson) {
    return
  }

  projectWorkflowSharedEvent({
    ...event,
    eventType: 'Shared',
    payload: {
      ...event.payload,
      workflow_id: readPayloadString(event.payload, 'workflow_id') ?? event.resourceId,
      workflow_json: workflowJson,
    },
  })
}

export function reconcileWorkflowSharedResources(workspaceId: string): void {
  const terminalByWorkflow = new Map<string, WorkspaceEvent>()
  const workflowJsonById = new Map<string, string>()

  let sinceSeq = 0
  while (true) {
    const batch = listWorkspaceEventsSince(workspaceId, sinceSeq, 200)
    if (batch.length === 0) break

    for (const event of batch) {
      sinceSeq = event.seq
      if (event.resourceType !== 'Workflow') continue

      const workflowId = readPayloadString(event.payload, 'workflow_id') ?? event.resourceId

      if (event.eventType === 'Updated') {
        const workflowJson = readPayloadString(event.payload, 'workflow_json')
        if (workflowJson) {
          workflowJsonById.set(workflowId, workflowJson)
        }
        continue
      }

      if (
        event.eventType !== 'Shared' &&
        event.eventType !== 'Created' &&
        event.eventType !== 'Deleted'
      ) {
        continue
      }

      terminalByWorkflow.set(workflowId, event)
    }

    if (batch.length < 200) break
  }

  for (const event of terminalByWorkflow.values()) {
    if (event.eventType === 'Deleted') {
      projectWorkflowDeletedEvent(event)
      continue
    }

    const workflowId = readPayloadString(event.payload, 'workflow_id') ?? event.resourceId
    const workflowJson =
      readPayloadString(event.payload, 'workflow_json') ?? workflowJsonById.get(workflowId)
    projectWorkflowSharedEvent({
      ...event,
      payload: workflowJson
        ? { ...event.payload, workflow_json: workflowJson }
        : event.payload,
    })
  }
}

export function getProjectedWorkflow(workflowId: string) {
  return getStoredWorkflow(workflowId)
}
