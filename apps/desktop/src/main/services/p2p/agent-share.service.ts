import {
  P2pSharedResourceRepository,
  assistants,
  type P2pSharedResourceRow,
} from '@toolman/db'
import { eq } from 'drizzle-orm'
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
  getAssistantRowIncludingDeleted,
  listAssistants,
  restoreAssistantIfDeleted,
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

export const DEFAULT_GROUP_AGENT_MODEL_ID = 'openai/gpt-4o-mini'

export function normalizeAssistantModelId(modelId: string | null | undefined): string {
  const trimmed = modelId?.trim()
  if (!trimmed) return DEFAULT_GROUP_AGENT_MODEL_ID
  const sep = trimmed.indexOf(':')
  if (sep > 0 && sep < trimmed.length - 1) {
    return trimmed
  }
  return DEFAULT_GROUP_AGENT_MODEL_ID
}

export function readSharedAgentModelId(
  metadata: ReturnType<typeof readAgentShareMetadata>,
): string | undefined {
  if (!metadata.packageJson) return undefined
  try {
    const pkg = AgentPackageSchema.parse(JSON.parse(metadata.packageJson))
    return normalizeAssistantModelId(pkg.assistant.modelId)
  } catch {
    return undefined
  }
}

export function readAgentShareMetadata(metadataJson: string | null | undefined): {
  sourceWorkspaceId?: string
  sessionIds?: string[]
  sessionTitles?: Record<string, string>
  packageJson?: string
  sessionPermissions?: Record<string, P2pAgentSessionPermission>
} {
  if (!metadataJson) return {}
  try {
    const parsed = JSON.parse(metadataJson) as {
      sourceWorkspaceId?: string
      sessionIds?: string[]
      sessionTitles?: Record<string, unknown>
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
    const sessionTitles: Record<string, string> = {}
    if (parsed.sessionTitles && typeof parsed.sessionTitles === 'object') {
      for (const [sessionId, title] of Object.entries(parsed.sessionTitles)) {
        if (typeof title === 'string' && title.trim()) {
          sessionTitles[sessionId] = title
        }
      }
    }
    return {
      sourceWorkspaceId: parsed.sourceWorkspaceId,
      packageJson: parsed.packageJson,
      sessionIds: Array.isArray(parsed.sessionIds)
        ? parsed.sessionIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      sessionTitles: Object.keys(sessionTitles).length > 0 ? sessionTitles : undefined,
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
  sessionTitles?: Record<string, string>
  packageJson?: string
  sessionPermissions?: Record<string, P2pAgentSessionPermission>
}): string {
  return JSON.stringify({
    ...(metadata.sourceWorkspaceId ? { sourceWorkspaceId: metadata.sourceWorkspaceId } : {}),
    ...(metadata.packageJson ? { packageJson: metadata.packageJson } : {}),
    ...(metadata.sessionIds ? { sessionIds: metadata.sessionIds } : {}),
    ...(metadata.sessionTitles && Object.keys(metadata.sessionTitles).length > 0
      ? { sessionTitles: metadata.sessionTitles }
      : {}),
    ...(metadata.sessionPermissions && Object.keys(metadata.sessionPermissions).length > 0
      ? { sessionPermissions: metadata.sessionPermissions }
      : {}),
  })
}

export function parseAgentSessionTitlesFromPayload(
  payload: Record<string, unknown>,
): Record<string, string> | undefined {
  const raw = payload.session_titles
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const sessionTitles: Record<string, string> = {}
  for (const [sessionId, title] of Object.entries(raw)) {
    if (typeof title === 'string' && title.trim()) {
      sessionTitles[sessionId] = title
    }
  }
  return Object.keys(sessionTitles).length > 0 ? sessionTitles : undefined
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

function listAssistantSessionTitles(
  workspaceId: string,
  assistantId: string,
  sessionIds?: string[],
): Record<string, string> {
  const allowed = sessionIds ? new Set(sessionIds) : null
  const titles: Record<string, string> = {}
  for (const row of getSessionRepository().listRows({ workspaceId, assistantId, limit: 10_000 })) {
    if (allowed && !allowed.has(row.id)) continue
    titles[row.id] = row.title
  }
  return titles
}

function mergeSessionTitles(
  existing: Record<string, string> | undefined,
  incoming: Record<string, string>,
  sessionIds?: string[],
): Record<string, string> | undefined {
  const merged = { ...(existing ?? {}), ...incoming }
  if (sessionIds) {
    for (const key of Object.keys(merged)) {
      if (!sessionIds.includes(key)) {
        delete merged[key]
      }
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
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
  const sessionIds = metadata.sessionIds
  const sessionTitles = metadata.sessionTitles ?? {}
  const sharedSessionTitles =
    sessionIds && sessionIds.length > 0
      ? Object.fromEntries(
          sessionIds.map((sessionId) => [sessionId, sessionTitles[sessionId] ?? '未命名话题']),
        )
      : Object.keys(sessionTitles).length > 0
        ? sessionTitles
        : undefined

  return {
    ...base,
    sharedSessionIds: sessionIds,
    sharedSessionTitles,
    sharedSessionPermissions: metadata.sessionPermissions,
    sharedModelId: readSharedAgentModelId(metadata),
    sourceWorkspaceId: metadata.sourceWorkspaceId,
  }
}

export function clearGroupMirrorFlagFromSourceAssistant(assistantId: string): void {
  const existing = getAssistantRowIncludingDeleted(assistantId)
  if (!existing) return

  const params = JSON.parse(existing.parametersJson) as Record<string, unknown>
  if (!params.p2pGroupSharedMirror) return

  const { p2pGroupSharedMirror: _mirror, ...rest } = params
  updateAssistant({
    id: assistantId,
    parameters: rest,
  })
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
    restoreAssistantIfDeleted(existingAssistantId)
    const updated = updateAssistant({
      id: existingAssistantId,
      name: parsed.assistant.name,
      systemPrompt: parsed.assistant.systemPrompt,
      modelId: normalizeAssistantModelId(parsed.assistant.modelId),
      parameters,
    })
    if (updated) {
      return { assistantId: updated.id }
    }
  }

  const created = createAssistant({
    workspaceId: targetWorkspaceId,
    name: parsed.assistant.name,
    systemPrompt: parsed.assistant.systemPrompt,
    modelId: normalizeAssistantModelId(parsed.assistant.modelId),
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
): string[] | undefined {
  if (!incoming || incoming.length === 0) {
    return existing
  }
  return [...new Set([...(existing ?? []), ...incoming])]
}

export async function shareP2pAgent(rawInput: unknown): Promise<{ sharedResource: P2pSharedResource }> {
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
  if (assistant.parameters?.p2pGroupProxy) {
    throw new Error('不能共享群组虚拟智能体')
  }

  clearGroupMirrorFlagFromSourceAssistant(assistant.id)

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
  const allSessionIds = listAssistantSessionIds(sourceWorkspaceId, assistant.id)
  const sessionIds = shareWholeAgent
    ? allSessionIds
    : mergeSharedSessionIds(existingMetadata.sessionIds, input.sessionIds)
  const sessionTitles = mergeSessionTitles(
    existingMetadata.sessionTitles,
    listAssistantSessionTitles(sourceWorkspaceId, assistant.id, sessionIds),
    sessionIds,
  )

  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson,
    sessionIds,
    sessionTitles,
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

  await appendP2pEvent({
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
      session_ids: sessionIds ?? [],
      ...(sessionTitles ? { session_titles: sessionTitles } : {}),
      ...(existingMetadata.sessionPermissions
        ? { session_permissions: existingMetadata.sessionPermissions }
        : {}),
    },
  })

  return { sharedResource: mapP2pAgentSharedResourceRow(resource) }
}

export async function removeP2pAgentSessions(
  rawInput: unknown,
): Promise<{ sharedResource: P2pSharedResource | null }> {
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
    const metadataJson = serializeAgentShareMetadata({
      sourceWorkspaceId,
      packageJson: metadata.packageJson,
    })
    sharedRepo.update({ id: resource.id, status: 'unshared', metadataJson })
    await appendP2pEvent({
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

  const nextTitles = mergeSessionTitles(metadata.sessionTitles, {}, nextIds)
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId,
    packageJson: metadata.packageJson,
    sessionIds: nextIds,
    sessionTitles: nextTitles,
    sessionPermissions: Object.fromEntries(
      Object.entries(metadata.sessionPermissions ?? {}).filter(([id]) => !removeSet.has(id)),
    ),
  })
  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  await appendP2pEvent({
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
      ...(nextTitles ? { session_titles: nextTitles } : {}),
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

export async function setP2pAgentSessionPermission(rawInput: unknown): Promise<{
  sharedResource: P2pSharedResource
}> {
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
    sessionTitles: metadata.sessionTitles,
    sessionPermissions,
  })

  const updated =
    sharedRepo.update({
      id: resource.id,
      metadataJson,
    }) ?? resource

  await appendP2pEvent({
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

export async function unshareP2pAgent(rawInput: unknown): Promise<{ unshared: true }> {
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
  const metadata = readAgentShareMetadata(resource.metadataJson)
  const metadataJson = serializeAgentShareMetadata({
    sourceWorkspaceId: metadata.sourceWorkspaceId,
    packageJson: metadata.packageJson,
  })
  sharedRepo.update({ id: resource.id, status: 'unshared', metadataJson })

  await appendP2pEvent({
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

/** Owner's source assistants must never carry the joiner-only mirror flag. */
export function sanitizeOwnerSourceAgentMirrorFlags(workspaceId: string): void {
  const db = getDatabase()
  const sharedRepo = new P2pSharedResourceRepository(db)
  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, workspaceId))
    .all()

  for (const row of rows) {
    if (row.deletedAt) continue

    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    if (!params.p2pGroupSharedMirror) continue

    const activeShares = sharedRepo.listActiveByLocalResource(row.id, 'Agent')
    const isOwnerSource = activeShares.some((share) => {
      const metadata = readAgentShareMetadata(share.metadataJson)
      return metadata.sourceWorkspaceId === workspaceId
    })

    if (isOwnerSource) {
      clearGroupMirrorFlagFromSourceAssistant(row.id)
    }
  }
}
