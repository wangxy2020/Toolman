import { logStructured } from '../../structured-log.service'
import type { ContentBlock } from '@toolman/shared'
import { blobExists } from '../../blob.service'
import { fetchBlobFromPeers } from '../p2p-blob-transfer.service'

export async function ensureRelayContentBlobs(
  peerDeviceId: string,
  p2pWorkspaceId: string,
  contentBlocks: ContentBlock[],
): Promise<void> {
  const hashes = new Set<string>()

  for (const block of contentBlocks) {
    if (block.type === 'file' || block.type === 'image') {
      const hash = block.blobHash?.trim()
      if (hash) hashes.add(hash)
    }
    if (block.type === 'file' && block.visionPages?.length) {
      for (const page of block.visionPages) {
        const hash = page.blobHash?.trim()
        if (hash) hashes.add(hash)
      }
    }
  }

  for (const hash of hashes) {
    if (blobExists(hash)) continue

    logStructured('p2p', 'info', `agent relay fetching blob: hash=${hash.slice(0, 12)}… peer=${peerDeviceId}`)
    const ok = await fetchBlobFromPeers(p2pWorkspaceId, hash, undefined, peerDeviceId)
    if (!ok) {
      throw new Error(`附件未能从群组成员同步（${hash.slice(0, 8)}…），请让对方重新发送`)
    }
  }
}
