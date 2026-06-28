import { randomUUID } from 'node:crypto'
import { logStructured } from '../structured-log.service'
import { toErrorMessage, isDefaultSessionTitle } from '@toolman/shared'
import {P2pAgentOpenSessionInputSchema,
  P2pGroupAgentProxySchema,
  type Message,
  type P2pGroupAgentProxy } from '@toolman/shared'
import {
  P2pMemberRepository,
  P2pSharedResourceRepository,
  P2pWorkspaceRepository,
  assistants,
  blocksToText,
  createMessageRepository,
  createSessionRepository,
  runInTransaction,
} from '@toolman/db'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import { toIpcSession } from '../../mappers/chat'
import { createAssistant, getAssistantRow, listAssistants, restoreAssistantIfDeleted, updateAssistant } from '../assistant.service'
import { clearSessionMessages, createSession, deleteSession } from '../session.service'
import { getDefaultWorkspace } from '../workspace.service'
import {
  normalizeAssistantModelId,
  readAgentShareMetadata,
  readSharedAgentModelId,
} from './agent-share.service'
import {
  resolveGroupProxyAssistantDisplayName,
  resolveP2pWorkspaceName,
  stripGroupPrefixedName,
} from './p2p-group-resource-naming'
import { resolveAgentRelayResourceId, findAgentSharedResourceInWorkspace } from './p2p-shared-resource-id'
import { fetchRemoteSessionHistory } from './p2p-agent-relay.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { ensureOwnerMemberRecord } from './p2p-member-shared'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getSharedResourceRepo(): P2pSharedResourceRepository {
  return new P2pSharedResourceRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}


function readSessionProxyMetadata(metadataJson: string): P2pGroupAgentProxy | null {
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: unknown }
    const raw = parsed.p2pGroupAgent
    if (!raw || typeof raw !== 'object') return null

    const direct = P2pGroupAgentProxySchema.safeParse(raw)
    if (direct.success) {
      try {
        return normalizeP2pGroupAgentProxyOwnerDevice(direct.data)
      } catch {
        return null
      }
    }

    const partial = raw as Record<string, unknown>
    const p2pWorkspaceId = typeof partial.p2pWorkspaceId === 'string' ? partial.p2pWorkspaceId : null
    const resourceId = typeof partial.resourceId === 'string' ? partial.resourceId : null
    const sourceAssistantId =
      typeof partial.sourceAssistantId === 'string' ? partial.sourceAssistantId : null
    const sourceSessionId =
      typeof partial.sourceSessionId === 'string' ? partial.sourceSessionId : null
    const ownerMemberId = typeof partial.ownerMemberId === 'string' ? partial.ownerMemberId : null
    if (!p2pWorkspaceId || !resourceId || !sourceAssistantId || !sourceSessionId || !ownerMemberId) {
      return null
    }

    let ownerDeviceId: string
    try {
      ownerDeviceId = resolveOwnerDeviceId(ownerMemberId, p2pWorkspaceId)
    } catch {
      return null
    }

    let referencedModelId =
      typeof partial.referencedModelId === 'string' ? partial.referencedModelId : ''
    if (!referencedModelId.trim()) {
      referencedModelId = resolveSharedAgentModelId(
        '',
        p2pWorkspaceId,
        resourceId,
        sourceAssistantId,
      )
    }

    const repaired = P2pGroupAgentProxySchema.safeParse({
      p2pWorkspaceId,
      resourceId,
      sourceAssistantId,
      sourceSessionId,
      ownerMemberId,
      ownerDeviceId,
      permission: partial.permission === 'callable' ? 'callable' : 'read',
      groupName: typeof partial.groupName === 'string' ? partial.groupName : '',
      sharedAgentName: typeof partial.sharedAgentName === 'string' ? partial.sharedAgentName : '',
      referencedModelId,
    })
    return repaired.success ? normalizeP2pGroupAgentProxyOwnerDevice(repaired.data) : null
  } catch {
    return null
  }
}

function proxyResourceMatches(
  proxy: P2pGroupAgentProxy,
  relayResourceId: string,
  legacyResourceId?: string,
): boolean {
  if (proxy.resourceId === relayResourceId || proxy.sourceAssistantId === relayResourceId) {
    return true
  }
  return Boolean(legacyResourceId && proxy.resourceId === legacyResourceId)
}

function findProxySession(
  workspaceId: string,
  relayResourceId: string,
  sourceSessionId: string,
  legacyResourceId?: string,
): string | null {
  const rows = getSessionRepository().listRows({ workspaceId, limit: 10_000 })
  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (
      proxy &&
      proxy.sourceSessionId === sourceSessionId &&
      proxyResourceMatches(proxy, relayResourceId, legacyResourceId)
    ) {
      return row.id
    }
  }
  return null
}

function findProxyAssistant(
  workspaceId: string,
  relayResourceId: string,
  p2pWorkspaceId: string,
  legacyResourceId?: string,
) {
  const assistants = listAssistants({ workspaceId, pinnedOnly: false })
  return (
    assistants.find((item) => {
      const proxy = item.parameters.p2pGroupProxy
      return (
        proxy?.p2pWorkspaceId === p2pWorkspaceId &&
        proxyResourceMatches(
          proxy as P2pGroupAgentProxy,
          relayResourceId,
          legacyResourceId,
        )
      )
    }) ?? null
  )
}

function findOrRestoreProxyAssistant(
  workspaceId: string,
  relayResourceId: string,
  p2pWorkspaceId: string,
  legacyResourceId?: string,
) {
  const active = findProxyAssistant(
    workspaceId,
    relayResourceId,
    p2pWorkspaceId,
    legacyResourceId,
  )
  if (active) return active

  const db = getDatabase()
  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, workspaceId))
    .all()

  for (const row of rows) {
    if (!row.deletedAt) continue
    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    const proxy = params.p2pGroupProxy as P2pGroupAgentProxy | undefined
    if (
      !proxy ||
      proxy.p2pWorkspaceId !== p2pWorkspaceId ||
      !proxyResourceMatches(proxy, relayResourceId, legacyResourceId)
    ) {
      continue
    }
    restoreAssistantIfDeleted(row.id)
    return findProxyAssistant(workspaceId, relayResourceId, p2pWorkspaceId, legacyResourceId)
  }

  return null
}

function normalizeGroupAgentProxy(proxy: P2pGroupAgentProxy): P2pGroupAgentProxy {
  const relayResourceId = resolveAgentRelayResourceId(
    getSharedResourceRepo(),
    proxy.p2pWorkspaceId,
    proxy.resourceId,
    proxy.sourceAssistantId,
  )
  if (relayResourceId === proxy.resourceId) {
    return proxy
  }
  return { ...proxy, resourceId: relayResourceId }
}

function buildProxySessionMetadata(input: {
  p2pWorkspaceId: string
  resourceId: string
  sourceAssistantId: string
  sourceSessionId: string
  ownerMemberId: string
  ownerDeviceId: string
  permission: P2pGroupAgentProxy['permission']
  groupName: string
  sharedAgentName: string
  referencedModelId: string
}): P2pGroupAgentProxy {
  return {
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: input.resourceId,
    sourceAssistantId: input.sourceAssistantId,
    sourceSessionId: input.sourceSessionId,
    ownerMemberId: input.ownerMemberId,
    ownerDeviceId: input.ownerDeviceId,
    permission: input.permission,
    groupName: input.groupName,
    sharedAgentName: input.sharedAgentName,
    referencedModelId: input.referencedModelId,
  }
}

function resolveOwnerDeviceId(ownerMemberId: string, p2pWorkspaceId: string): string {
  const workspace = getWorkspaceRepo().findById(p2pWorkspaceId)
  const member = getMemberRepo().findById(ownerMemberId)
  const localDeviceId = getP2pDeviceInfo().deviceId

  if (member?.role === 'owner' && workspace?.ownerDeviceId) {
    return workspace.ownerDeviceId
  }

  if (member?.deviceId && member.deviceId !== localDeviceId) {
    return member.deviceId
  }

  ensureOwnerMemberRecord(p2pWorkspaceId)

  const ownerByRole = getMemberRepo()
    .listByWorkspace(p2pWorkspaceId, 'active')
    .find((row) => row.role === 'owner')
  if (ownerByRole?.deviceId && ownerByRole.deviceId !== localDeviceId) {
    return ownerByRole.deviceId
  }

  if (workspace?.ownerDeviceId && workspace.ownerDeviceId !== localDeviceId) {
    return workspace.ownerDeviceId
  }

  throw new Error('共享者不存在')
}

export function normalizeP2pGroupAgentProxyOwnerDevice(
  proxy: P2pGroupAgentProxy,
): P2pGroupAgentProxy {
  const localDeviceId = getP2pDeviceInfo().deviceId
  try {
    const ownerDeviceId = resolveOwnerDeviceId(proxy.ownerMemberId, proxy.p2pWorkspaceId)
    if (ownerDeviceId === proxy.ownerDeviceId) {
      return proxy
    }
    return { ...proxy, ownerDeviceId }
  } catch {
    const workspace = getWorkspaceRepo().findById(proxy.p2pWorkspaceId)
    if (workspace?.ownerDeviceId && workspace.ownerDeviceId !== localDeviceId) {
      return { ...proxy, ownerDeviceId: workspace.ownerDeviceId }
    }
    if (proxy.ownerDeviceId !== localDeviceId) {
      return proxy
    }
    throw new Error('无法解析群组智能体所有者设备')
  }
}

function isLocalOwner(ownerDeviceId: string): boolean {
  return ownerDeviceId === getP2pDeviceInfo().deviceId
}

function resolveSharedAgentModelId(
  referencedModelId: string,
  p2pWorkspaceId: string,
  relayResourceId: string,
  sourceAssistantId?: string,
): string {
  const normalizedInput = normalizeAssistantModelId(referencedModelId)
  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    p2pWorkspaceId,
    relayResourceId,
    sourceAssistantId,
  )
  const metadata = readAgentShareMetadata(resource?.metadataJson)
  const fromPackage = readSharedAgentModelId(metadata)
  if (fromPackage) return fromPackage
  return normalizedInput
}

function resolveSharedSessionTitle(
  p2pWorkspaceId: string,
  relayResourceId: string,
  sourceSessionId: string,
  fallbackTitle: string,
  sourceAssistantId?: string,
): string {
  const trimmedFallback = fallbackTitle.trim()
  if (
    trimmedFallback &&
    trimmedFallback !== '未命名话题' &&
    trimmedFallback !== '共享话题' &&
    !isDefaultSessionTitle(trimmedFallback)
  ) {
    return trimmedFallback
  }

  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    p2pWorkspaceId,
    relayResourceId,
    sourceAssistantId,
  )
  const metadata = readAgentShareMetadata(resource?.metadataJson)
  return metadata.sessionTitles?.[sourceSessionId]?.trim() || trimmedFallback || '未命名话题'
}

export function readP2pGroupAgentFromSessionRow(
  metadataJson: string,
): P2pGroupAgentProxy | null {
  const proxy = readSessionProxyMetadata(metadataJson)
  return proxy
}

export function persistRepairedSessionProxyMetadata(
  sessionId: string,
  metadataJson: string,
  proxyMeta: P2pGroupAgentProxy,
): void {
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: unknown }
    const existing = parsed.p2pGroupAgent
    if (
      existing &&
      P2pGroupAgentProxySchema.safeParse(existing).success &&
      JSON.stringify(existing) === JSON.stringify(proxyMeta)
    ) {
      return
    }
    getSessionRepository().update(sessionId, {
      metadata: { p2pGroupAgent: proxyMeta },
    })
  } catch {
    getSessionRepository().update(sessionId, {
      metadata: { p2pGroupAgent: proxyMeta },
    })
  }
}

function findSiblingProxyMeta(
  workspaceId: string,
  resourceId: string,
  p2pWorkspaceId: string,
): P2pGroupAgentProxy | null {
  const rows = getSessionRepository().listRows({ workspaceId, limit: 10_000 })
  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (proxy?.resourceId === resourceId && proxy.p2pWorkspaceId === p2pWorkspaceId) {
      return proxy
    }
  }
  return null
}

export function inheritGroupProxySessionMetadata(
  workspaceId: string,
  assistantId: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!assistantId) return undefined
  const assistant = getAssistantRow(assistantId)
  const proxyParams = assistant?.parameters?.p2pGroupProxy as
    | { resourceId?: string; p2pWorkspaceId?: string }
    | undefined
  if (!proxyParams?.resourceId || !proxyParams.p2pWorkspaceId) {
    return undefined
  }
  const sibling = findSiblingProxyMeta(
    workspaceId,
    proxyParams.resourceId,
    proxyParams.p2pWorkspaceId,
  )
  if (!sibling) return undefined
  return { p2pGroupAgent: sibling }
}

export function resolveProxyMetaForSend(
  metadataJson: string,
  assistant: ReturnType<typeof getAssistantRow>,
): P2pGroupAgentProxy | null {
  const fromSession = readP2pGroupAgentFromSessionRow(metadataJson)
  if (fromSession) {
    return normalizeGroupAgentProxy(normalizeP2pGroupAgentProxyOwnerDevice(fromSession))
  }

  const proxyParams = assistant?.parameters?.p2pGroupProxy
  if (!proxyParams?.resourceId || !proxyParams.p2pWorkspaceId) {
    return null
  }

  let partial: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: Record<string, unknown> }
    partial = parsed.p2pGroupAgent ?? {}
  } catch {
    partial = {}
  }

  const sourceSessionId =
    typeof partial.sourceSessionId === 'string' ? partial.sourceSessionId : null

  const relayResourceId = resolveAgentRelayResourceId(
    getSharedResourceRepo(),
    proxyParams.p2pWorkspaceId,
    proxyParams.resourceId,
    proxyParams.sourceAssistantId,
  )
  const resource = findAgentSharedResourceInWorkspace(
    getSharedResourceRepo(),
    proxyParams.p2pWorkspaceId,
    proxyParams.resourceId,
    proxyParams.sourceAssistantId,
  )
  if (!resource?.sharedBy) {
    return null
  }

  if (!sourceSessionId && assistant?.workspaceId) {
    const sibling = findSiblingProxyMeta(
      assistant.workspaceId,
      relayResourceId,
      proxyParams.p2pWorkspaceId,
    )
    if (sibling) {
      return normalizeGroupAgentProxy(sibling)
    }
    return null
  }

  if (!sourceSessionId) {
    return null
  }

  let ownerDeviceId: string
  try {
    ownerDeviceId = resolveOwnerDeviceId(resource.sharedBy, proxyParams.p2pWorkspaceId)
  } catch {
    return null
  }

  const referencedModelId = resolveSharedAgentModelId(
    typeof partial.referencedModelId === 'string'
      ? partial.referencedModelId
      : typeof proxyParams.referencedModelId === 'string'
        ? proxyParams.referencedModelId
        : assistant?.modelId ?? '',
    proxyParams.p2pWorkspaceId,
    relayResourceId,
    proxyParams.sourceAssistantId,
  )

  const repaired = normalizeP2pGroupAgentProxyOwnerDevice({
    p2pWorkspaceId: proxyParams.p2pWorkspaceId,
    resourceId: relayResourceId,
    sourceAssistantId: proxyParams.sourceAssistantId,
    sourceSessionId,
    ownerMemberId:
      typeof partial.ownerMemberId === 'string' ? partial.ownerMemberId : resource.sharedBy,
    ownerDeviceId,
    permission: partial.permission === 'callable' ? 'callable' : 'read',
    groupName: proxyParams.groupName,
    sharedAgentName: proxyParams.sharedAgentName,
    referencedModelId,
  })

  return normalizeGroupAgentProxy(repaired)
}

export async function openP2pGroupAgentSession(rawInput: unknown): Promise<{
  sessionId: string
  assistantId: string
}> {
  const input = P2pAgentOpenSessionInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.p2pWorkspaceId)
  ensureOwnerMemberRecord(input.p2pWorkspaceId)

  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) {
    throw new Error('工作区未就绪')
  }

  const sharedRepo = getSharedResourceRepo()
  const relayResourceId = resolveAgentRelayResourceId(
    sharedRepo,
    input.p2pWorkspaceId,
    input.resourceId,
    input.sourceAssistantId,
  )
  const legacyResourceId =
    input.resourceId !== relayResourceId ? input.resourceId : undefined

  const ownerDeviceId = resolveOwnerDeviceId(input.ownerMemberId, input.p2pWorkspaceId)
  const sessionTitle = resolveSharedSessionTitle(
    input.p2pWorkspaceId,
    relayResourceId,
    input.sourceSessionId,
    input.sessionTitle,
    input.sourceAssistantId,
  )
  const proxyModelId = resolveSharedAgentModelId(
    input.referencedModelId,
    input.p2pWorkspaceId,
    relayResourceId,
    input.sourceAssistantId,
  )
  const canonicalGroupName = resolveP2pWorkspaceName(input.p2pWorkspaceId) ?? input.groupName
  const plainSharedAgentName = stripGroupPrefixedName(input.p2pWorkspaceId, input.sharedAgentName)
  const expectedAssistantName = resolveGroupProxyAssistantDisplayName(
    input.p2pWorkspaceId,
    input.sharedAgentName,
  )
  const proxyMetaInput = {
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: relayResourceId,
    sourceAssistantId: input.sourceAssistantId,
    sourceSessionId: input.sourceSessionId,
    ownerMemberId: input.ownerMemberId,
    ownerDeviceId,
    permission: input.permission,
    groupName: canonicalGroupName,
    sharedAgentName: plainSharedAgentName,
    referencedModelId: proxyModelId,
  }
  const existingSessionId = findProxySession(
    personalWorkspace.id,
    relayResourceId,
    input.sourceSessionId,
    legacyResourceId,
  )

  if (existingSessionId) {
    const existing = getSessionRepository().findRowById(existingSessionId)
    if (existing?.assistantId) {
      restoreAssistantIfDeleted(existing.assistantId)
      if (getAssistantRow(existing.assistantId)) {
        const existingAssistant = findOrRestoreProxyAssistant(
          personalWorkspace.id,
          relayResourceId,
          input.p2pWorkspaceId,
          legacyResourceId,
        )
        if (existingAssistant) {
          const existingProxy = existingAssistant.parameters.p2pGroupProxy
          const repairedProxy = existingProxy
            ? {
                ...existingProxy,
                resourceId: relayResourceId,
                referencedModelId: proxyModelId,
              }
            : undefined
          if (
            existingAssistant.modelId !== proxyModelId ||
            existingProxy?.referencedModelId !== proxyModelId ||
            existingProxy?.resourceId !== relayResourceId
          ) {
            updateAssistant({
              id: existingAssistant.id,
              modelId: proxyModelId,
              parameters: repairedProxy
                ? { p2pGroupProxy: repairedProxy }
                : undefined,
            })
          }
        }
        getSessionRepository().update(existingSessionId, {
          title: sessionTitle,
          metadata: {
            p2pGroupAgent: buildProxySessionMetadata(proxyMetaInput),
          },
        })
        if (!isLocalOwner(ownerDeviceId)) {
          try {
            await syncProxySessionHistory(existingSessionId, {
              p2pWorkspaceId: input.p2pWorkspaceId,
              resourceId: relayResourceId,
              sourceAssistantId: input.sourceAssistantId,
              sourceSessionId: input.sourceSessionId,
              ownerDeviceId,
              sessionTitle,
            })
          } catch (error) {
            const message = toErrorMessage(error, String(error))
            logStructured('p2p', 'warn', `proxy session history sync failed: ${message}`)
          }
        }
        return { sessionId: existingSessionId, assistantId: existing.assistantId }
      }
    }
  }

  let assistant = findOrRestoreProxyAssistant(
    personalWorkspace.id,
    relayResourceId,
    input.p2pWorkspaceId,
    legacyResourceId,
  )

  if (assistant) {
    const existingProxy = assistant.parameters.p2pGroupProxy
    const repairedProxy = existingProxy
      ? {
          ...existingProxy,
          resourceId: relayResourceId,
          sourceAssistantId: input.sourceAssistantId,
          groupName: canonicalGroupName,
          sharedAgentName: plainSharedAgentName,
          referencedModelId: proxyModelId,
        }
      : undefined
    if (
      assistant.name !== expectedAssistantName ||
      assistant.modelId !== proxyModelId ||
      existingProxy?.referencedModelId !== proxyModelId ||
      existingProxy?.resourceId !== relayResourceId
    ) {
      updateAssistant({
        id: assistant.id,
        name: expectedAssistantName,
        modelId: proxyModelId,
        ...(repairedProxy ? { parameters: { p2pGroupProxy: repairedProxy } } : {}),
      })
      assistant = {
        ...assistant,
        name: expectedAssistantName,
        modelId: proxyModelId,
        parameters: repairedProxy
          ? { ...assistant.parameters, p2pGroupProxy: repairedProxy }
          : assistant.parameters,
      }
    }
  } else {
    assistant = createAssistant({
      workspaceId: personalWorkspace.id,
      name: expectedAssistantName,
      systemPrompt: '群组共享智能体代理',
      modelId: proxyModelId,
      parameters: {
        temperature: 0.7,
        skillIds: [],
        mcpServerIds: [],
        p2pGroupProxy: {
          p2pWorkspaceId: input.p2pWorkspaceId,
          resourceId: relayResourceId,
          sourceAssistantId: input.sourceAssistantId,
          groupName: canonicalGroupName,
          sharedAgentName: plainSharedAgentName,
          referencedModelId: proxyModelId,
        },
      },
      isPinned: false,
    })
  }

  if (!assistant) {
    throw new Error('代理智能体创建失败')
  }

  const proxyMeta = buildProxySessionMetadata(proxyMetaInput)

  let sessionId: string
  if (existingSessionId) {
    getSessionRepository().update(existingSessionId, {
      assistantId: assistant.id,
      title: sessionTitle,
      metadata: { p2pGroupAgent: proxyMeta },
    })
    sessionId = existingSessionId
  } else {
    const session = createSession({
      workspaceId: personalWorkspace.id,
      assistantId: assistant.id,
      title: sessionTitle,
      type: 'chat',
      metadata: {
        p2pGroupAgent: proxyMeta,
      },
    })
    sessionId = session.id
  }

  if (!isLocalOwner(ownerDeviceId)) {
    try {
      await syncProxySessionHistory(sessionId, {
        p2pWorkspaceId: input.p2pWorkspaceId,
        resourceId: relayResourceId,
        sourceAssistantId: input.sourceAssistantId,
        sourceSessionId: input.sourceSessionId,
        ownerDeviceId,
        sessionTitle,
      })
    } catch (error) {
      const message = toErrorMessage(error, String(error))
      logStructured('p2p', 'warn', `proxy session history sync failed: ${message}`)
    }
  }

  return { sessionId, assistantId: assistant.id }
}

async function syncProxySessionHistory(
  proxySessionId: string,
  opts: {
    p2pWorkspaceId: string
    resourceId: string
    sourceAssistantId: string
    sourceSessionId: string
    ownerDeviceId: string
    sessionTitle: string
  },
): Promise<void> {
  const { title, messages } = await fetchRemoteSessionHistory({
    ownerDeviceId: opts.ownerDeviceId,
    p2pWorkspaceId: opts.p2pWorkspaceId,
    resourceId: opts.resourceId,
    sourceAssistantId: opts.sourceAssistantId,
    sourceSessionId: opts.sourceSessionId,
  })

  await replaceProxySessionMessages(proxySessionId, messages, title || opts.sessionTitle)
}

export async function replaceProxySessionMessages(
  sessionId: string,
  messages: Message[],
  title?: string,
): Promise<void> {
  clearSessionMessages({ sessionId })

  if (messages.length === 0) {
    if (title) {
      getSessionRepository().update(sessionId, { title })
    }
    return
  }

  const idMap = new Map<string, string>()
  for (const message of messages) {
    idMap.set(message.id, randomUUID())
  }

  runInTransaction(getDatabase(), (tx) => {
    const messageRepo = createMessageRepository(tx)
    const sessionRepo = createSessionRepository(tx)

    for (const message of messages) {
      const contentBlocks = message.contentBlocks
      messageRepo.createWithId({
        id: idMap.get(message.id)!,
        sessionId,
        parentMessageId: message.parentMessageId
          ? idMap.get(message.parentMessageId) ?? null
          : null,
        role: message.role,
        modelId: message.modelId,
        content: blocksToText(contentBlocks),
        contentBlocks,
        status: message.status === 'streaming' ? 'completed' : message.status,
        touchSession: false,
      })
    }

    sessionRepo.touch(sessionId, messages.length)
    if (title) {
      sessionRepo.update(sessionId, { title })
    }
  })
}

export function parseAgentSharePermissionForSession(
  metadataJson: string | null | undefined,
  sourceSessionId: string,
): 'read' | 'callable' {
  const metadata = readAgentShareMetadata(metadataJson)
  return metadata.sessionPermissions?.[sourceSessionId] ?? 'read'
}

export function syncGroupProxyAssistantModels(workspaceId: string): void {
  const db = getDatabase()
  const rows = db
    .select()
    .from(assistants)
    .where(eq(assistants.workspaceId, workspaceId))
    .all()

  for (const row of rows) {
    if (row.deletedAt) continue

    const params = JSON.parse(row.parametersJson) as Record<string, unknown>
    const proxy = params.p2pGroupProxy as
      | { resourceId?: string; p2pWorkspaceId?: string; sourceAssistantId?: string }
      | undefined
    if (!proxy?.resourceId || !proxy.p2pWorkspaceId) continue

    const expectedModelId = resolveSharedAgentModelId(
      row.modelId,
      proxy.p2pWorkspaceId,
      proxy.resourceId,
      proxy.sourceAssistantId,
    )
    if (row.modelId !== expectedModelId) {
      updateAssistant({
        id: row.id,
        modelId: expectedModelId,
      })
    }
  }
}

export function cleanupLocalProxySessionsForResource(
  resourceId: string,
  allowedSourceSessionIds?: ReadonlySet<string>,
): void {
  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) return

  const rows = getSessionRepository().listRows({
    workspaceId: personalWorkspace.id,
    limit: 10_000,
  })

  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (!proxy || proxy.resourceId !== resourceId) continue
    if (allowedSourceSessionIds?.has(proxy.sourceSessionId)) continue
    deleteSession({ id: row.id })
  }
}

export function syncLocalProxySessionPermissions(input: {
  resourceId: string
  sessionPermissions: Record<string, 'read' | 'callable'>
}): void {
  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) return

  const rows = getSessionRepository().listRows({
    workspaceId: personalWorkspace.id,
    limit: 10_000,
  })

  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (!proxy || proxy.resourceId !== input.resourceId) continue

    const nextPermission = input.sessionPermissions[proxy.sourceSessionId]
    if (!nextPermission || nextPermission === proxy.permission) continue

    getSessionRepository().update(row.id, {
      metadata: {
        p2pGroupAgent: {
          ...proxy,
          permission: nextPermission,
        },
      },
    })
  }
}

export function toIpcSessionFromId(sessionId: string) {
  const row = getSessionRepository().findRowById(sessionId)
  return row ? toIpcSession(row) : null
}
