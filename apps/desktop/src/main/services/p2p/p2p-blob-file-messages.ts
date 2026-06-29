import { P2pBridge } from './p2p-bridge'
import {
  encodeFileChannelMessage,
  type FileChannelMessage,
} from './p2p-file-protocol'
import { broadcastP2pSyncProgress } from './p2p-sync-broadcast'

export async function sendFileMessage(peerDeviceId: string, message: FileChannelMessage): Promise<void> {
  await P2pBridge.connectionSend(peerDeviceId, 'files', encodeFileChannelMessage(message))
}

export function broadcastFileProgress(
  workspaceId: string,
  current: number,
  total: number,
): void {
  broadcastP2pSyncProgress({
    workspaceId,
    phase: 'files',
    current,
    total,
  })
}
