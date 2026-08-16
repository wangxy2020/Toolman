import {
  personalSyncWorkspaceId,
  sealMailboxPlaintext,
  workspaceKeyFromB64,
  type SyncChange,
} from '@toolman/shared'
import {
  getOrCreatePersonalPairingStore,
  listPairedPersonalDevices,
} from './personal-device-pairing.service'
import { putMailboxRecord } from './p2p/p2p-mailbox-store'
import { saveWorkspaceKey } from './p2p/p2p-workspace-key.store'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { logStructured } from './structured-log.service'
import { toErrorMessage } from '@toolman/shared'

/** Deposit sealed SyncChange batches into the personal mailbox for paired devices. */
export async function depositPersonalSyncChanges(changes: SyncChange[]): Promise<void> {
  if (changes.length === 0) return
  const paired = listPairedPersonalDevices()
  if (paired.length === 0) return
  try {
    const store = getOrCreatePersonalPairingStore()
    const workspaceId = personalSyncWorkspaceId(store.identityId)
    saveWorkspaceKey(workspaceId, store.workspaceKeyB64)
    const workspaceKey = workspaceKeyFromB64(store.workspaceKeyB64)
    const local = getP2pDeviceInfo()
    const ciphertextB64 = await sealMailboxPlaintext({
      workspaceKey,
      workspaceId,
      plaintext: {
        type: 'device.sync.changes',
        senderDeviceId: local.deviceId,
        changes,
        depositedAt: Date.now(),
      },
    })
    const seq = Date.now()
    for (const peer of paired) {
      putMailboxRecord({
        workspaceId,
        recipientDeviceId: peer.deviceId,
        seq,
        ciphertextB64,
        depositedAt: Date.now(),
      })
    }
  } catch (error) {
    logStructured(
      'mobile-sync',
      'warn',
      `personal mailbox deposit failed: ${toErrorMessage(error, String(error))}`,
    )
  }
}
