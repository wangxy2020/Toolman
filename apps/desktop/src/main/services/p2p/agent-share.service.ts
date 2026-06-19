import {
  P2pSharedResourceRepository,
  type P2pSharedResourceRow,
} from '@toolman/db'
import {
  AgentPackageSchema,
  P2pAgentExportPackageInputSchema,
  P2pAgentImportPackageInputSchema,
  P2pAgentShareInputSchema,
  P2pAgentRemoveSessionsInputSchema,
  P2pAgentSetSessionPermissionInputSchema,
  P2pResourceUnshareInputSchema,
  type AgentPackage,
  type Assistant,
  type P2pAgentSessionPermission,
  type P2pSharedResource,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import {
  createAssistant,
  listAssistants,
  updateAssistant,
} from '../assistant.service'
import { getDefaultWorkspace } from '../workspace.service'
import { appendP2pEvent } from './p2p-event.service'
import {
  findSharedResourceInWorkspace,
  resolveSharedResourceId,
} from './p2p-shared-resource-id'
import {
  assertCanManageSharedResource,
  assertCanShareResource,
} from './p2p-permission.guard'

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

export function readAgentShareMetadata(metadataJson: string | null | undefined): {
  sourceWorkspaceId?: string
  sessionIds?: string[]
  packageJson?: string
  sessionPermissions?: Record<string, P2pAgentSessionPermission>
} {
  if (!metadataJson) return {}
  try {
    const parsed = JSON.parse(metadataJson) as {
      sourceWorkspaceId?: string
      sessionIds?: string[]
      packageJson?: string
      sessionPermissions?: Record<string, unknown>
    }
    const sessionPermissions: Record<string, P2pAgentSessionPermission> = {}
    if (parsed.sessionPermissions && typeof parsed.sessionPermissions === 'object') {
      for (const [sessionId, permission] of Object.entries(parsed.sessionPermissions)) {
        if (permission === 'read' || permission === 'callable') {
          sessionPermissions[sessionId] = permission
        }
      }
    }
    return {
      sourceWorkspaceId: parsed.sourceWorkspaceId,
      packageJson: parsed.packageJson,
      sessionIds: Array.isArray(parsed.sessionIds)
        ? parsed.sessionIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      sessionPermissions:
        Object.keys(sessionPermissions).length > 0 ? sessionPermissions : undefined,
    }
  } catch {
    return {}
  }
}

export function serializeAgentShareMetadata(metadata: {
  sourceWorkspaceId?: string
  sessionIds?: string[]
  packageJson?: string
  sessionPermissions?: Record<string, P2pAgentSessionPermission>
}): string {
  return JSON.stringify({
    ...(metadata.sourceWorkspaceId ? { sourceWorkspaceId: metadata.sourceWorkspaceId } : {}),
    ...(metadata.packageJson ? { packageJson: metadata.packageJson } : {}),
    ...(metadata.sessionIds ? { sessionIds: metadata.sessionIds } : {}),
    ...(metadata.sessionPermissions && Object.keys(metadata.sessionPermissions).length > 0
      ? { sessionPermissions: metadata.sessionPermissions }
      : {}),
  })
}

export function parseAgentSessionPermissionsFromPayload(
  payload: Record<string, unknown>,
): Record<string, P2pAgentSessionPermission> | undefined {
  const raw = payload.session_permissions
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const sessionPermissions: Record<string, P2pAgentSessionPermission> = {}
  for (const [sessionId, permission] of Object.entries(raw)) {
    if (permission === 'read' || permission === 'callable') {
      sessionPermissions[sessionId] = permission
    }
  }
  return Object.keys(sessionPermissions).length > 0 ? sessionPermissions : undefined
}

function listAssistantSessionIds(workspaceId: string, assistantId: string): string[] {
  return getSessionRepository()
    .listRows({ workspaceId, assistantId, limit: 10_000 })
    .map((row) => row.id)
}

export function mapP2pAgentSharedResourceRow(row: P2pSharedResourceRow): P2pSharedResource {
  const base: P2pSharedResource = {
    id: row.id,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    localResourceId: row.localResourceId,
    name: row.name,
    sharedBy: row.sharedBy,
    permission: row.permission,
    contentHash: row.contentHash,
    version: row.version ?? 1,
    status: row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }

  if (row.resourceType !== 'Agent') {
    return base
  }

  const metadata = readAgentShareMetadata(row.metadataJson)
  return {
    ...base,
    sharedSessionIds: metadata.sessionIds,
    sharedSessionPermissions: metadata.sessionPermissions,
    sourceWorkspaceId: metadata.sourceWorkspaceId,
  }
}

function getAssistantInWorkspace(assistantId: string, workspaceId: string): Assistant | null {
  const assistants = listAssistants({ workspaceId, pinnedOnly: false })
  return assistants.find((item) => item.id === assistantId) ?? null
}

export function buildAgentPackageFromAssistant(assistant: Assistant): AgentPackage {
  const {
    kbIds,
    mcpServerIds,
    skillIds,
    toolStates,
    ...restParameters
  } = assistant.parameters

  const toolIds = [
    ...(skillIds ?? []),
    ...Object.entries(toolStates ?? {})
      .filter(([, enabled]) => enabled)
      .map(([toolId]) => toolId),
  ]

  return AgentPackageSchema.parse({
    version: 1,
    exportedAt: Date.now(),
    assistant: {
      name: assistant.name,
      systemPrompt: assistant.systemPrompt,
      modelId: assistant.modelId,
      parameters: restParameters,
      mcpServers: mcpServerIds ?? [],
      toolIds: [...new Set(toolIds)],
      knowledgeRefs: kbIds ?? [],
    },
    workflow: null,
  })
}

function packageToAssistantParameters(pkg: AgentPackage['assistant']) {
  const mcpServerIds = pkg.mcpServers.filter((item): item is string => typeof item === 'string')
  return {
    ...(pkg.parameters ?? {}),
    ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
    ...(pkg.toolIds.length > 0 ? { skillIds: pkg.toolIds } : {}),
    ...(pkg.knowledgeRefs.length > 0 ? { kbIds: pkg.knowledgeRefs } : {}),
  }
}

export function importAgentPackageToWorkspace(
  targetWorkspaceId: string,
  packageJson: string,
  existingAssistantId?: string,
): { assistantId: string } {
  const parsed = AgentPackageSchema.parse(JSON.parse(packageJson))
  const parameters = packageToAssistantParameters(parsed.assistant)

  if (existingAssistantId) {
    const updated = updateAssistant({
      id: existingAssistantId,
      name: parsed.assistant.name,
      systemPrompt: parsed.assistant.systemPrompt,
      modelId: parsed.assistant.modelId,
      parameters,
    })
    if (!updated) {
      throw new Error('更新智能体失败')
    }
    return { assistantId: updated.id }
  }

  const created = createAssistant({
    workspaceId: targetWorkspaceId,
    name: parsed.assistant.name,
    systemPrompt: parsed.assistant.systemPrompt,
    modelId: parsed.assistant.modelId ?? 'openai/gpt-4o-mini',
    parameters,
    isPinned: false,
  })

  return { assistantId: created.id }
}

export function exportP2pAgentPackage(rawInput: unknown): {
  package: AgentPackage
  packageJson: string
} {
  const input = P2pAgentExportPackageInputSchema.parse(rawInput)
  const defaultWorkspace = getDefaultWorkspace()
  if (!defaultWorkspace) {
    throw new Error('工作区未就绪')
  }

  const assistant = getAssistantInWorkspace(input.assistantId, defaultWorkspace.id)
  if (!assistant) {
    throw new Error('智能体不存在')
  }

  const agentPackage = buildAgentPackageFromAssistant(assistant)
  return {
    package: agentPackage,
    packageJson: JSON.stringify(agentPackage),
  }
}

export function importP2pAgentPackage(rawInput: unknown): {
  assistantId: string
} {
  const input = P2pAgentImportPackageInputSchema.parse(rawInput)
  const { assistantId } = importAgentPackageToWorkspace(input.workspaceId, input.packageJson)
  return { assistantId }
}

function mergeSharedSessionIds(
  existing: string[] | undefined,
  incoming: string[] | undefined,
  shareWholeAgent: boolean,
): string[] | undefined {
  if (shareWholeAgent) {
    return undefined
  }
  if (!incoming || incoming.length === 0) {
    return existing
  }
  return [...new Set([...(existing ?? []), ...incoming])]
}

export function shareP2pAgent(rawInput: unknown): { sharedResource: P2pSharedResource } {
  const input = P2pAgentShareInputSchema.parse(rawInput)
  const member = assertCanShareResource(input.workspaceId)
  const sourceWorkspaceId = input.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const assistant = getAssistantInWorkspace(input.assistantId, sourceWorkspaceId)
  if (!assistant) {
    throw new Error('智能体不存在')
  }

  const agentPackage = buildAgentPackageFromAssistant(assistant)
  const packageJson = JSON.stringify(agentPackage)
  const shareWholeAgent = !input.sessionIds || input.sessionIds.length === 0
  const sharedRepo = getSharedResourceRepo()
  let resource = findSharedResourceInWorkspace(
    sharedRepo,
    input.workspaceId,
    assistant.id,
    'Agent',
  )

  const existingMetadata = resource ? readAgentShareMetadata(resource.metadataJson) : {}
  const sessionIds = mergeSharedSessionIds(
    existingMetadata.sessionIds,
    input.sessionIds,
    shareWholeAgent,
  )

  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson,
    sessionIds,
    sessionPermissions: existingMetadata.sessionPermissions,
  })

  if (!resource) {
    resource = sharedRepo.create({
      id: resolveSharedResourceId(sharedRepo, assistant.id, input.workspaceId),
      workspaceId: input.workspaceId,
      resourceType: 'Agent',
      localResourceId: assistant.id,
      name: assistant.name,
      sharedBy: member.id,
      permission: input.permission ?? 'read',
      metadataJson,
    })
  } else if (resource.status !== 'active') {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: assistant.name,
        status: 'active',
        metadataJson,
      }) ?? resource
  } else {
    resource =
      sharedRepo.update({
        id: resource.id,
        name: assistant.name,
        metadataJson,
      }) ?? resource
  }

  appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: assistant.id,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      assistant_id: assistant.id,
      name: assistant.name,
      package_json: packageJson,
      source_workspace_id: sourceWorkspaceId,
      permission: input.permission ?? 'read',
      ...(sessionIds ? { session_ids: sessionIds } : {}),
      ...(existingMetadata.sessionPermissions
        ? { session_permissions: existingMetadata.sessionPermissions }
        : {}),
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(resource) }
}

export function removeP2pAgentSessions(
  rawInput: unknown,
): { sharedResource: P2pSharedResource | null } {
  const input = P2pAgentRemoveSessionsInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Agent') {
    throw new Error('只能修改智能体共享资源')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  const metadata = readAgentShareMetadata(resource.metadataJson)
  const assistantId = resource.localResourceId ?? resource.id
  const sourceWorkspaceId = metadata.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId) {
    throw new Error('工作区未就绪')
  }

  const allSessionIds = listAssistantSessionIds(sourceWorkspaceId, assistantId)
  const currentIds = metadata.sessionIds ?? allSessionIds
  const removeSet = new Set(input.sessionIds)
  const nextIds = currentIds.filter((id) => !removeSet.has(id))

  if (nextIds.length === currentIds.length) {
    throw new Error('未能移除所选话题')
  }

  if (nextIds.length === 0) {
    sharedRepo.update({ id: resource.id, status: 'unshared' })
    appendP2pEvent({
      workspaceId: input.workspaceId,
      resourceType: 'Agent',
      resourceId: assistantId,
      operatorId: member.id,
      eventType: 'Deleted',
      payload: {
        assistant_id: assistantId,
      },
    })
    return { sharedResource: null }
  }

  if (!metadata.packageJson) {
    throw new Error('智能体共享元数据不完整')
  }

  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson: metadata.packageJson,
    sessionIds: nextIds,
    sessionPermissions: Object.fromEntries(
      Object.entries(metadata.sessionPermissions ?? {}).filter(([id]) => !removeSet.has(id)),
    ),
  })
  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: assistantId,
    operatorId: member.id,
    eventType: 'Shared',
    payload: {
      assistant_id: assistantId,
      name: updated.name,
      package_json: metadata.packageJson,
      source_workspace_id: sourceWorkspaceId,
      session_ids: nextIds,
      ...(metadata.sessionPermissions
        ? {
            session_permissions: Object.fromEntries(
              Object.entries(metadata.sessionPermissions).filter(([id]) => !removeSet.has(id)),
            ),
          }
        : {}),
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(updated) }
}

export function setP2pAgentSessionPermission(rawInput: unknown): {
  sharedResource: P2pSharedResource
} {
  const input = P2pAgentSetSessionPermissionInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Agent' || resource.status !== 'active') {
    throw new Error('共享资源不存在')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  const metadata = readAgentShareMetadata(resource.metadataJson)
  const assistantId = resource.localResourceId ?? resource.id
  const sourceWorkspaceId = metadata.sourceWorkspaceId ?? getDefaultWorkspace()?.id
  if (!sourceWorkspaceId || !metadata.packageJson) {
    throw new Error('智能体共享元数据不完整')
  }

  const sharedSessionIds =
    metadata.sessionIds ?? listAssistantSessionIds(sourceWorkspaceId, assistantId)
  if (!sharedSessionIds.includes(input.sessionId)) {
    throw new Error('话题未共享到群组')
  }

  const sessionPermissions = {
    ...(metadata.sessionPermissions ?? {}),
    [input.sessionId]: input.permission,
  }
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson: metadata.packageJson,
    sessionIds: metadata.sessionIds,
    sessionPermissions,
  })

  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: assistantId,
    operatorId: member.id,
    eventType: 'Updated',
    payload: {
      assistant_id: assistantId,
      session_id: input.sessionId,
      session_permission: input.permission,
      session_permissions: sessionPermissions,
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(updated) }
}

export function unshareP2pAgent(rawInput: unknown): { unshared: true } {
  const input = P2pResourceUnshareInputSchema.parse(rawInput)
  const sharedRepo = getSharedResourceRepo()
  const resource = sharedRepo.findById(input.resourceId)
  if (!resource || resource.workspaceId !== input.workspaceId) {
    throw new Error('共享资源不存在')
  }
  if (resource.resourceType !== 'Agent') {
    throw new Error('只能取消共享智能体资源')
  }

  const member = assertCanManageSharedResource(input.workspaceId, resource.sharedBy)
  sharedRepo.update({ id: resource.id, status: 'unshared' })

  appendP2pEvent({
    workspaceId: input.workspaceId,
    resourceType: 'Agent',
    resourceId: resource.localResourceId ?? resource.id,
    operatorId: member.id,
    eventType: 'Deleted',
    payload: {
      assistant_id: resource.localResourceId ?? resource.id,
    },
  })

  return { unshared: true }
}

export function resolveAgentImportWorkspaceId(): string | null {
  return getDefaultWorkspace()?.id ?? null
}
