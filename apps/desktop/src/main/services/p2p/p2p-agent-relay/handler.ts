import { registerP2pSyncHandlers } from '../p2p-sync-lifecycle'
import { handleOwnerFetch } from './fetch'
import { handleOwnerSend } from './send'
import { dispatchPendingResponse } from './pending'
import { handleMemberStream } from './stream'
import { parseRelayMessage } from './transport'

export async function handleP2pAgentRelayMessage(
  peerDeviceId: string,
  data: Buffer | Uint8Array,
): Promise<void> {
  const message = parseRelayMessage(Buffer.from(data))

  switch (message.type) {
    case 'fetch':
      await handleOwnerFetch(peerDeviceId, message)
      return
    case 'send':
      await handleOwnerSend(peerDeviceId, message)
      return
    case 'fetch_ok':
    case 'fetch_ok_part':
    case 'fetch_err':
    case 'send_ok':
    case 'send_err':
      dispatchPendingResponse(message)
      return
    case 'stream':
      handleMemberStream(message)
      return
    default:
      return
  }
}

export function bootstrapP2pAgentRelay(): void {
  registerP2pSyncHandlers({
    handleAgentRelayMessage: handleP2pAgentRelayMessage,
  })
}
