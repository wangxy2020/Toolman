import { randomUUID } from 'node:crypto'
import {
  P2pAgentOpenSessionInputSchema,
  P2pGroupAgentProxySchema,
  type Message,
  type P2pGroupAgentProxy,
} from '@toolman/shared'
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
import { clearSessionMessages, createSession } from '../session.service'
import { getDefaultWorkspace } from '../workspace.service'
import {
  normalizeAssistantModelId,
  readAgentShareMetadata,
  readSharedAgentModelId,
} from './agent-share.service'
import { buildGroupVirtualAgentName } from './p2p-group-resource-naming'
import { fetchRemoteSessionHistory } from './p2p-agent-relay.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { ensureOwnerMemberRecord } from './p2p-member.service'
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

function buildProxyAssistantName(
  p2pWorkspaceId: string,
  groupName: string,
  sharedAgentName: string,
): string {
  return buildGroupVirtualAgentName(p2pWorkspaceId, sharedAgentName, groupName)
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
      referencedModelId = resolveSharedAgentModelId('', resourceId)
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

function findProxySession(
  workspaceId: string,
  resourceId: string,
  sourceSessionId: string,
): string | null {
  const rows = getSessionRepository().listRows({ workspaceId, limit: 10_000 })
  for (const row of rows) {
    const proxy = readSessionProxyMetadata(row.metadataJson)
    if (
      proxy &&
      proxy.resourceId === resourceId &&
      proxy.sourceSessionId === sourceSessionId
    ) {
      return row.id
    }
  }
  return null
}

function findProxyAssistant(workspaceId: string, resourceId: string, p2pWorkspaceId: string) {
  const assistants = listAssistants({ workspaceId, pinnedOnly: false })
  return (
    assistants.find((item) => {
      const proxy = item.parameters.p2pGroupProxy
      return (
        proxy?.resourceId === resourceId && proxy.p2pWorkspaceId === p2pWorkspaceId
      )
    }) ?? null
  )
}

function findOrRestoreProxyAssistant(
  workspaceId: string,
  resourceId: string,
  p2pWorkspaceId: string,
) {
  const active = findProxyAssistant(workspaceId, resourceId, p2pWorkspaceId)
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
    const proxy = params.p2pGroupProxy as
      | { resourceId?: string; p2pWorkspaceId?: string }
      | undefined
    if (proxy?.resourceId !== resourceId || proxy.p2pWorkspaceId !== p2pWorkspaceId) {
      continue
    }
    restoreAssistantIfDeleted(row.id)
    return findProxyAssistant(workspaceId, resourceId, p2pWorkspaceId)
  }

  return null
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

function resolveSharedAgentModelId(referencedModelId: string, resourceId: string): string {
  const normalizedInput = normalizeAssistantModelId(referencedModelId)
  const resource = getSharedResourceRepo().findById(resourceId)
  const metadata = readAgentShareMetadata(resource?.metadataJson)
  const fromPackage = readSharedAgentModelId(metadata)
  if (fromPackage) return fromPackage
  return normalizedInput
}

function resolveSharedSessionTitle(
  resourceId: string,
  sourceSessionId: string,
  fallbackTitle: string,
): string {
  const trimmedFallback = fallbackTitle.trim()
  if (
    trimmedFallback &&
    trimmedFallback !== '未命名话题' &&
    trimmedFallback !== '共享话题' &&
    trimmedFallback !== '新对话'
  ) {
    return trimmedFallback
  }

  const resource = getSharedResourceRepo().findById(resourceId)
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

export function resolveProxyMetaForSend(
  metadataJson: string,
  assistant: ReturnType<typeof getAssistantRow>,
): P2pGroupAgentProxy | null {
  const fromSession = readP2pGroupAgentFromSessionRow(metadataJson)
  if (fromSession) {
    return fromSession
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

  let sourceSessionId =
    typeof partial.sourceSessionId === 'string' ? partial.sourceSessionId : null

  const resource = getSharedResourceRepo().findById(proxyParams.resourceId)
  if (!resource?.sharedBy) {
    return null
  }

  if (!sourceSessionId && assistant?.workspaceId) {
    const sibling = findSiblingProxyMeta(
      assistant.workspaceId,
      proxyParams.resourceId,
      proxyParams.p2pWorkspaceId,
    )
    if (sibling) {
      return sibling
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
    proxyParams.resourceId,
  )

  const repaired = normalizeP2pGroupAgentProxyOwnerDevice({
    p2pWorkspaceId: proxyParams.p2pWorkspaceId,
    resourceId: proxyParams.resourceId,
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

  return repaired
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

  const ownerDeviceId = resolveOwnerDeviceId(input.ownerMemberId, input.p2pWorkspaceId)
  const sessionTitle = resolveSharedSessionTitle(
    input.resourceId,
    input.sourceSessionId,
    input.sessionTitle,
  )
  const proxyModelId = resolveSharedAgentModelId(input.referencedModelId, input.resourceId)
  const proxyMetaInput = {
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: input.resourceId,
    sourceAssistantId: input.sourceAssistantId,
    sourceSessionId: input.sourceSessionId,
    ownerMemberId: input.ownerMemberId,
    ownerDeviceId,
    permission: input.permission,
    groupName: input.groupName,
    sharedAgentName: input.sharedAgentName,
    referencedModelId: proxyModelId,
  }
  const existingSessionId = findProxySession(
    personalWorkspace.id,
    input.resourceId,
    input.sourceSessionId,
  )

  if (existingSessionId) {
    const existing = getSessionRepository().findRowById(existingSessionId)
    if (existing?.assistantId) {
      restoreAssistantIfDeleted(existing.assistantId)
      if (getAssistantRow(existing.assistantId)) {
        const existingAssistant = findOrRestoreProxyAssistant(
          personalWorkspace.id,
          input.resourceId,
          input.p2pWorkspaceId,
        )
        if (existingAssistant) {
          const existingProxy = existingAssistant.parameters.p2pGroupProxy
          if (
            existingAssistant.modelId !== proxyModelId ||
            existingProxy?.referencedModelId !== proxyModelId
          ) {
            updateAssistant({
              id: existingAssistant.id,
              modelId: proxyModelId,
              parameters: existingProxy
                ? {
                    p2pGroupProxy: {
                      ...existingProxy,
                      referencedModelId: proxyModelId,
                    },
                  }
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
              resourceId: input.resourceId,
              sourceSessionId: input.sourceSessionId,
              ownerDeviceId,
              sessionTitle,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`[p2p] proxy session history sync failed: ${message}`)
          }
        }
        return { sessionId: existingSessionId, assistantId: existing.assistantId }
      }
    }
  }

  let assistant = findOrRestoreProxyAssistant(
    personalWorkspace.id,
    input.resourceId,
    input.p2pWorkspaceId,
  )

  const expectedAssistantName = buildProxyAssistantName(
    input.p2pWorkspaceId,
    input.groupName,
    input.sharedAgentName,
  )

  if (assistant) {
    if (assistant.name !== expectedAssistantName) {
      updateAssistant({
        id: assistant.id,
        name: expectedAssistantName,
      })
      assistant = { ...assistant, name: expectedAssistantName }
    }
    const existingProxy = assistant.parameters.p2pGroupProxy
    if (assistant.modelId !== proxyModelId || existingProxy?.referencedModelId !== proxyModelId) {
      updateAssistant({
        id: assistant.id,
        modelId: proxyModelId,
        parameters: existingProxy
          ? {
              p2pGroupProxy: {
                ...existingProxy,
                referencedModelId: proxyModelId,
              },
            }
          : undefined,
      })
      assistant = {
        ...assistant,
        modelId: proxyModelId,
        parameters: existingProxy
          ? {
              ...assistant.parameters,
              p2pGroupProxy: {
                ...existingProxy,
                referencedModelId: proxyModelId,
              },
            }
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
        p2pGroupProxy: {
          p2pWorkspaceId: input.p2pWorkspaceId,
          resourceId: input.resourceId,
          sourceAssistantId: input.sourceAssistantId,
          groupName: input.groupName,
          sharedAgentName: input.sharedAgentName,
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
        resourceId: input.resourceId,
        sourceSessionId: input.sourceSessionId,
        ownerDeviceId,
        sessionTitle,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[p2p] proxy session history sync failed: ${message}`)
    }
  }

  return { sessionId, assistantId: assistant.id }
}

async function syncProxySessionHistory(
  proxySessionId: string,
  opts: {
    p2pWorkspaceId: string
    resourceId: string
    sourceSessionId: string
    ownerDeviceId: string
    sessionTitle: string
  },
): Promise<void> {
  const { title, messages } = await fetchRemoteSessionHistory({
    ownerDeviceId: opts.ownerDeviceId,
    p2pWorkspaceId: opts.p2pWorkspaceId,
    resourceId: opts.resourceId,
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
    const proxy = params.p2pGroupProxy as { resourceId?: string } | undefined
    if (!proxy?.resourceId) continue

    const expectedModelId = resolveSharedAgentModelId(row.modelId, proxy.resourceId)
    if (row.modelId !== expectedModelId) {
      updateAssistant({
        id: row.id,
        modelId: expectedModelId,
      })
    }
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
