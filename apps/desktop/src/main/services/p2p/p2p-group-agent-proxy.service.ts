import { randomUUID } from 'node:crypto'
import {
  P2pAgentOpenSessionInputSchema,
  P2pGroupAgentProxySchema,
  type Message,
  type P2pGroupAgentProxy,
} from '@toolman/shared'
import { P2pMemberRepository, blocksToText, createMessageRepository, createSessionRepository, runInTransaction } from '@toolman/db'
import { getDatabase } from '../../bootstrap/database'
import { getSessionRepository } from '../../db/repos'
import { toIpcSession } from '../../mappers/chat'
import { createAssistant, listAssistants } from '../assistant.service'
import { clearSessionMessages, createSession } from '../session.service'
import { getDefaultWorkspace } from '../workspace.service'
import { readAgentShareMetadata } from './agent-share.service'
import { fetchRemoteSessionHistory } from './p2p-agent-relay.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { getP2pDeviceInfo } from './p2p-device-identity.service'

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function buildProxyAssistantName(groupName: string, sharedAgentName: string): string {
  return `${groupName}${sharedAgentName}`
}

function readSessionProxyMetadata(metadataJson: string): P2pGroupAgentProxy | null {
  try {
    const parsed = JSON.parse(metadataJson) as { p2pGroupAgent?: unknown }
    if (!parsed.p2pGroupAgent) return null
    return P2pGroupAgentProxySchema.parse(parsed.p2pGroupAgent)
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

function resolveOwnerDeviceId(ownerMemberId: string): string {
  const member = getMemberRepo().findById(ownerMemberId)
  if (!member) {
    throw new Error('共享者不存在')
  }
  return member.deviceId
}

function isLocalOwner(ownerDeviceId: string): boolean {
  return ownerDeviceId === getP2pDeviceInfo().deviceId
}

export function readP2pGroupAgentFromSessionRow(
  metadataJson: string,
): P2pGroupAgentProxy | null {
  return readSessionProxyMetadata(metadataJson)
}

export async function openP2pGroupAgentSession(rawInput: unknown): Promise<{
  sessionId: string
  assistantId: string
}> {
  const input = P2pAgentOpenSessionInputSchema.parse(rawInput)
  assertWorkspaceMemberAccess(input.p2pWorkspaceId)

  const personalWorkspace = getDefaultWorkspace()
  if (!personalWorkspace) {
    throw new Error('工作区未就绪')
  }

  const ownerDeviceId = resolveOwnerDeviceId(input.ownerMemberId)
  const existingSessionId = findProxySession(
    personalWorkspace.id,
    input.resourceId,
    input.sourceSessionId,
  )

  if (existingSessionId) {
    const existing = getSessionRepository().findRowById(existingSessionId)
    if (existing?.assistantId) {
      if (!isLocalOwner(ownerDeviceId)) {
        await syncProxySessionHistory(existingSessionId, {
          p2pWorkspaceId: input.p2pWorkspaceId,
          resourceId: input.resourceId,
          sourceSessionId: input.sourceSessionId,
          ownerDeviceId,
          sessionTitle: input.sessionTitle,
        })
      }
      return { sessionId: existingSessionId, assistantId: existing.assistantId }
    }
  }

  let assistant = findProxyAssistant(
    personalWorkspace.id,
    input.resourceId,
    input.p2pWorkspaceId,
  )

  if (!assistant) {
    assistant = createAssistant({
      workspaceId: personalWorkspace.id,
      name: buildProxyAssistantName(input.groupName, input.sharedAgentName),
      systemPrompt: '群组共享智能体代理',
      modelId: input.referencedModelId,
      parameters: {
        temperature: 0.7,
        p2pGroupProxy: {
          p2pWorkspaceId: input.p2pWorkspaceId,
          resourceId: input.resourceId,
          sourceAssistantId: input.sourceAssistantId,
          groupName: input.groupName,
          sharedAgentName: input.sharedAgentName,
        },
      },
      isPinned: false,
    })
  }

  const proxyMeta: P2pGroupAgentProxy = {
    p2pWorkspaceId: input.p2pWorkspaceId,
    resourceId: input.resourceId,
    sourceAssistantId: input.sourceAssistantId,
    sourceSessionId: input.sourceSessionId,
    ownerMemberId: input.ownerMemberId,
    ownerDeviceId,
    permission: input.permission,
    groupName: input.groupName,
    sharedAgentName: input.sharedAgentName,
    referencedModelId: input.referencedModelId,
  }

  const session = createSession({
    workspaceId: personalWorkspace.id,
    assistantId: assistant.id,
    title: input.sessionTitle,
    type: 'chat',
    metadata: {
      p2pGroupAgent: proxyMeta,
    },
  })

  if (!isLocalOwner(ownerDeviceId)) {
    await syncProxySessionHistory(session.id, {
      p2pWorkspaceId: input.p2pWorkspaceId,
      resourceId: input.resourceId,
      sourceSessionId: input.sourceSessionId,
      ownerDeviceId,
      sessionTitle: input.sessionTitle,
    })
  }

  return { sessionId: session.id, assistantId: assistant.id }
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

export function toIpcSessionFromId(sessionId: string) {
  const row = getSessionRepository().findRowById(sessionId)
  return row ? toIpcSession(row) : null
}
