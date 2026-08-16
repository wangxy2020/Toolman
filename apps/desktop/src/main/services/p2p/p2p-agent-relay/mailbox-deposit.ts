import { sealMailboxPlaintext, workspaceKeyFromB64, type AgentRelayMessage } from '@toolman/shared'
import { logStructured } from '../../structured-log.service'
import { getP2pDeviceInfo } from '../p2p-device-identity.service'
import { loadWorkspaceKey } from '../p2p-workspace-key.store'
import { putMailboxRecord } from '../p2p-mailbox-store'
import { depositCiphertextToCommunityMailbox } from '../p2p-mailbox-remote'

type RelayMailboxPeer = {
  workspaceId: string
  memberDeviceId: string
  mailboxOrigin: boolean
}

const peers = new Map<string, RelayMailboxPeer>()
const expiry = new Map<string, ReturnType<typeof setTimeout>>()
let seqClock = 0

function nextMailboxSeq(): number {
  const now = Date.now()
  seqClock = now <= seqClock ? seqClock + 1 : now
  return seqClock
}

export function rememberRelayMailboxPeer(
  requestId: string,
  workspaceId: string,
  memberDeviceId: string,
  mailboxOrigin = false,
): void {
  const existing = peers.get(requestId)
  peers.set(requestId, {
    workspaceId,
    memberDeviceId,
    mailboxOrigin: Boolean(existing?.mailboxOrigin || mailboxOrigin),
  })
  const previous = expiry.get(requestId)
  if (previous) clearTimeout(previous)
  expiry.set(
    requestId,
    setTimeout(() => {
      peers.delete(requestId)
      expiry.delete(requestId)
    }, 15 * 60_000),
  )
}

export function peekRelayMailboxPeer(requestId: string): RelayMailboxPeer | undefined {
  return peers.get(requestId)
}

export function clearRelayMailboxPeer(requestId: string): void {
  peers.delete(requestId)
  const timer = expiry.get(requestId)
  if (timer) clearTimeout(timer)
  expiry.delete(requestId)
}

export async function depositAgentRelayToMailbox(
  workspaceId: string,
  recipientDeviceId: string,
  relay: AgentRelayMessage,
): Promise<void> {
  if (relay.type === 'stream' && relay.event.type === 'message.delta') return
  const keyB64 = loadWorkspaceKey(workspaceId)
  if (!keyB64) throw new Error('群组密钥不可用，无法投递信箱')
  const local = getP2pDeviceInfo()
  const seq = nextMailboxSeq()
  const ciphertextB64 = await sealMailboxPlaintext({
    workspaceKey: workspaceKeyFromB64(keyB64),
    workspaceId,
    plaintext: {
      type: 'agent-relay.message',
      senderDeviceId: local.deviceId,
      relay,
    },
  })
  putMailboxRecord({
    workspaceId,
    recipientDeviceId,
    seq,
    ciphertextB64,
    depositedAt: Date.now(),
  })
  logStructured(
    'p2p',
    'info',
    `mailbox agent-relay deposited type=${relay.type} seq=${seq} recipient=${recipientDeviceId}`,
  )
  void depositCiphertextToCommunityMailbox({
    workspaceId,
    senderDeviceId: local.deviceId,
    recipientDeviceId,
    workspaceKey: workspaceKeyFromB64(keyB64),
    ciphertextB64,
    seq,
  })
}
