import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { P2pBridge } from './p2p-bridge'
import { handleP2pFileChannelMessage } from './p2p-blob-transfer.service'
import { handleP2pGroupChatChannelMessage } from './p2p-group-chat.service'
import { describeReplicationMessage } from './p2p-events-channel'
import { dispatchP2pAgentRelayMessage } from './p2p-sync-lifecycle'
import { parseReplicationMessage } from './p2p-sync-protocol'
import { handleReplicationMessage } from './p2p-sync-replication-handlers'

async function runIncomingChannelHandler(
  label: string,
  handler: () => void | Promise<void>,
): Promise<void> {
  try {
    await handler()
  } catch (error) {
    logStructured('p2p', 'error', `${label} failed: ${toErrorMessage(error, `Failed to process ${label}`)}`)
  }
}

export async function processP2pIncomingMessages(): Promise<void> {
  const messages = await P2pBridge.connectionDrainAllMessages()

  for (const item of messages) {
    if (item.channel === 'files') {
      await runIncomingChannelHandler('file channel message', () =>
        handleP2pFileChannelMessage(item.peerDeviceId, item.data),
      )
      continue
    }

    if (item.channel === 'agent-relay') {
      await runIncomingChannelHandler('agent relay message', () =>
        dispatchP2pAgentRelayMessage(item.peerDeviceId, item.data),
      )
      continue
    }

    if (item.channel === 'group-chat') {
      await runIncomingChannelHandler('group chat message', () =>
        handleP2pGroupChatChannelMessage(item.peerDeviceId, item.data),
      )
      continue
    }

    if (item.channel !== 'events') continue

    try {
      await handleReplicationMessage(item.peerDeviceId, item.data)
    } catch (error) {
      const parsed = parseReplicationMessage(item.data)
      const label = parsed ? describeReplicationMessage(parsed) : 'unknown'
      logStructured('p2p', 'error', `replication message failed: ${label} error=${toErrorMessage(error, 'Failed to process replication message')}`)
    }
  }
}
