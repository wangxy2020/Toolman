import os from 'node:os'

import { getCommunityHttpClient } from './community-bridge.service'
import { toApiJson } from './community-case'
import { getP2pDeviceId } from '../p2p/p2p-device-identity.service'

export async function touchCommunityPresence(): Promise<void> {
  const client = getCommunityHttpClient()
  if (!client) return

  await client.post('/api/v1/presence/heartbeat', toApiJson({
    deviceId: getP2pDeviceId(),
    deviceName: os.hostname(),
    deviceKind: 'desktop',
  }))
}
