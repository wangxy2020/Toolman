import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { P2pAgentOpenSessionInputSchema } from '@toolman/shared'
import { getSessionRepository } from '../../db/repos'
import {
  createAssistant,
  getAssistantRow,
  restoreAssistantIfDeleted,
  updateAssistant,
} from '../assistant.service'
import { createSession } from '../session.service'
import { getDefaultWorkspace } from '../workspace.service'
import {
  resolveGroupProxyAssistantDisplayName,
  resolveP2pWorkspaceName,
  stripGroupPrefixedName,
} from './p2p-group-resource-naming'
import { resolveAgentRelayResourceId } from './p2p-shared-resource-id'
import { fetchRemoteSessionHistory } from './p2p-agent-relay.service'
import { assertWorkspaceMemberAccess } from './p2p-permission.guard'
import { ensureOwnerMemberRecord } from './p2p-member-shared'
import {
  findOrRestoreProxyAssistant,
  findProxySession,
} from './p2p-group-agent-proxy-find'
import {
  buildProxySessionMetadata,
  resolveSharedAgentModelId,
  resolveSharedSessionTitle,
} from './p2p-group-agent-proxy-model'
import {
  isLocalOwner,
  resolveOwnerDeviceId,
} from './p2p-group-agent-proxy-owner'
import { replaceProxySessionMessages } from './p2p-group-agent-proxy-messages'
import { getSharedResourceRepo } from './p2p-group-agent-proxy-repos'

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
