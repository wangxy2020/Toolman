import {
  AgentRelayMessageSchema,
  type AgentRelayMessage,
  type ContentBlock,
  type Message,
  type MessageStreamEvent,
} from '@toolman/shared'
import type { ChatMessage } from '../state/MobileAppContext'
import { newUuid } from './bytes'
import { encodeReplicationMessage } from './meshCodec'
import {
  drainMailbox,
  getMailboxTarget,
  patchMailboxOwnerDevice,
  putMailboxPlaintext,
  resumePersistedMailboxSync,
  type MailboxSyncTarget,
} from './mailboxSync'
import { hasLiveSession, sendEventsJson } from './session'

const RELAY_TIMEOUT_MS = 10 * 60_000

type RelayWaiter = {
  onDelta?: (text: string, replace?: boolean) => void
  resolve: (value: { title?: string; messages?: ChatMessage[] }) => void
  reject: (error: Error) => void
  parts?: { title?: string; messages: Message[] }[]
}

const waiters = new Map<string, RelayWaiter>()

export function textFromContentBlocks(blocks: ContentBlock[] | undefined): string {
  if (!blocks) return ''
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

export function chatMessagesFromRelay(messages: Message[]): ChatMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      id: message.id,
      role: message.role === 'user' ? 'user' : 'assistant',
      content: textFromContentBlocks(message.contentBlocks),
      createdAt: message.createdAt,
    }))
}

function applyStreamDelta(event: MessageStreamEvent, onDelta?: (text: string, replace?: boolean) => void) {
  if (event.type === 'message.delta' && event.delta.type === 'text') {
    onDelta?.(event.delta.text, event.delta.replace)
    return
  }
  if (event.type === 'message.done') {
    const text = textFromContentBlocks(event.contentBlocks)
    if (text) onDelta?.(text, true)
  }
}

export function handleIncomingAgentRelay(raw: unknown): void {
  const parsed = AgentRelayMessageSchema.safeParse(raw)
  if (!parsed.success) return
  const message = parsed.data
  const waiter = waiters.get(message.requestId)
  if (!waiter) return

  if (message.type === 'stream') {
    if (message.event.type === 'message.error') {
      waiters.delete(message.requestId)
      waiter.reject(new Error(message.event.error.message || '发送消息失败'))
      return
    }
    applyStreamDelta(message.event, waiter.onDelta)
    if (message.event.type === 'message.done') {
      waiters.delete(message.requestId)
      waiter.resolve({})
    }
    return
  }
  if (message.type === 'send_ok' || message.type === 'fetch_ok') {
    if (message.type === 'send_ok') {
      const text = textFromContentBlocks(message.contentBlocks)
      if (text) waiter.onDelta?.(text, true)
      if (!text.trim()) return
    }
    waiters.delete(message.requestId)
    waiter.resolve(
      message.type === 'fetch_ok'
        ? { title: message.title, messages: chatMessagesFromRelay(message.messages) }
        : {},
    )
    return
  }
  if (message.type === 'fetch_ok_part') {
    const parts = waiter.parts ?? []
    parts[message.partIndex] = { title: message.title, messages: message.messages }
    waiter.parts = parts
    if (parts.filter(Boolean).length >= message.partCount) {
      waiters.delete(message.requestId)
      waiter.resolve({
        title: parts.find((part) => part?.title)?.title,
        messages: chatMessagesFromRelay(parts.flatMap((part) => part?.messages ?? [])),
      })
    }
    return
  }
  if (message.type === 'send_err' || message.type === 'fetch_err') {
    waiters.delete(message.requestId)
    waiter.reject(new Error(message.message || '群组智能体调用失败'))
  }
}

async function resolveOwnerDeviceId(
  workspaceId: string,
  hinted?: string,
): Promise<string | undefined> {
  if (hinted?.trim()) return hinted.trim()
  const mailbox = getMailboxTarget(workspaceId)
  if (mailbox?.ownerDeviceId) return mailbox.ownerDeviceId
  try {
    const { loadGroupChatStore } = await import('../storage/groupChat')
    const store = await loadGroupChatStore()
    const group = store.groups.find((item) => item.id === workspaceId)
    if (group?.ownerDeviceId) return group.ownerDeviceId
    return (store.membersByGroup[workspaceId] ?? []).find((member) => member.role === 'owner')
      ?.deviceId
  } catch {
    return undefined
  }
}

async function ensureRelayMailbox(
  workspaceId: string,
  ownerHint?: string,
): Promise<MailboxSyncTarget> {
  const { loadOrCreateDeviceIdentity } = await import('../storage/deviceIdentity')
  const { ensureMailboxForDesktopGroup } = await import('./mailboxBootstrap')
  const identity = await loadOrCreateDeviceIdentity()
  resumePersistedMailboxSync(identity.deviceId)
  if (!getMailboxTarget(workspaceId)) {
    await ensureMailboxForDesktopGroup({
      workspaceId,
      deviceId: identity.deviceId,
      identityId: identity.identityId ?? undefined,
    })
  }
  const ownerDeviceId = await resolveOwnerDeviceId(workspaceId, ownerHint)
  if (ownerDeviceId) patchMailboxOwnerDevice(workspaceId, ownerDeviceId)
  const target = getMailboxTarget(workspaceId)
  if (!target) throw new Error('无法连接群组信箱，请回到群组页刷新后再试')
  if (!target.ownerDeviceId) throw new Error('缺少群主设备，无法投递信箱')
  return target
}

async function sendRelay(
  workspaceId: string,
  relay: AgentRelayMessage,
  ownerDeviceId?: string,
): Promise<void> {
  if (hasLiveSession(workspaceId)) {
    try {
      await sendEventsJson(
        workspaceId,
        encodeReplicationMessage({
          type: 'agent-relay.message',
          relay,
        }),
      )
      return
    } catch {
      // Expo Go and WAN members fall back to mailbox.
    }
  }
  const target = await ensureRelayMailbox(workspaceId, ownerDeviceId)
  await putMailboxPlaintext(
    target,
    {
      type: 'agent-relay.message',
      senderDeviceId: target.deviceId,
      relay,
    },
    target.ownerDeviceId!,
    Date.now(),
    { fanout: true },
  )
}

function waitForRelay(
  workspaceId: string,
  requestId: string,
  onDelta?: (text: string, replace?: boolean) => void,
): Promise<{ title?: string; messages?: ChatMessage[] }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(poll)
      waiters.delete(requestId)
      reject(new Error('群组智能体响应超时'))
    }, RELAY_TIMEOUT_MS)
    const pollOnce = () => {
      const target = getMailboxTarget(workspaceId)
      if (target) void drainMailbox(target).catch(() => undefined)
    }
    pollOnce()
    const poll = setInterval(pollOnce, 1_000)
    waiters.set(requestId, {
      onDelta,
      resolve: (value) => {
        clearTimeout(timer)
        clearInterval(poll)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        clearInterval(poll)
        reject(error)
      },
    })
  })
}

export async function fetchGroupAgentHistory(input: {
  workspaceId: string
  resourceId: string
  sourceSessionId: string
  ownerDeviceId?: string
}): Promise<{ title?: string; messages: ChatMessage[] }> {
  const requestId = newUuid()
  const pending = waitForRelay(input.workspaceId, requestId)
  await sendRelay(input.workspaceId, {
    v: 1,
    type: 'fetch',
    requestId,
    p2pWorkspaceId: input.workspaceId,
    resourceId: input.resourceId,
    sourceSessionId: input.sourceSessionId,
  }, input.ownerDeviceId)
  const result = await pending
  return { title: result.title, messages: result.messages ?? [] }
}

export async function sendGroupAgentRelay(input: {
  workspaceId: string
  resourceId: string
  sourceSessionId: string
  memberSessionId: string
  memberUserMessageId: string
  memberAssistantMessageId: string
  text: string
  onDelta: (text: string, replace?: boolean) => void
  ownerDeviceId?: string
}): Promise<void> {
  const requestId = newUuid()
  const pending = waitForRelay(input.workspaceId, requestId, input.onDelta)
  await sendRelay(input.workspaceId, {
    v: 1,
    type: 'send',
    requestId,
    p2pWorkspaceId: input.workspaceId,
    resourceId: input.resourceId,
    sourceSessionId: input.sourceSessionId,
    memberSessionId: input.memberSessionId,
    memberUserMessageId: input.memberUserMessageId,
    memberAssistantMessageId: input.memberAssistantMessageId,
    contentBlocks: [{ type: 'text', text: input.text }],
  }, input.ownerDeviceId)
  await pending
}
