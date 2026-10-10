/**
 * Refresh the browser's signaling token and TURN credentials while the
 * desktop Sync Hub is still reachable.
 */
import {
  DevicePairingRecordSchema,
  SYNC_HUB_TOKEN_HEADER,
  SYNC_SIGNAL_TICKET_PATH,
} from '@toolman/shared'
import { z } from 'zod'
import { loadDevicePairing, saveDevicePairing } from '../storage/devicePairing'
import { fetchWithLocalNetwork, localNetworkRequestTimeoutMs } from './localNetworkFetch'
import { loadSyncHubToken, loadSyncIdentityId } from './mobileSync-client'

const TicketSchema = z.object({
  signalHost: z.string().min(1),
  signalToken: z.string().min(1),
  signalPeerId: z.string().min(1),
  desktopPeerId: z.string().min(1).optional(),
  iceServers: DevicePairingRecordSchema.shape.iceServers,
})

export async function refreshPersonalSignalTicket(baseUrl: string): Promise<void> {
  const pairing = await loadDevicePairing()
  if (!pairing) return
  const origin = baseUrl.replace(/\/+$/, '')
  if (!origin || origin === 'personal-mailbox') return
  const token = await loadSyncHubToken()
  const identityId = await loadSyncIdentityId()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
    headers[SYNC_HUB_TOKEN_HEADER] = token
  }
  if (identityId) headers['X-Community-User-Id'] = identityId
  const url = `${origin}${SYNC_SIGNAL_TICKET_PATH}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), localNetworkRequestTimeoutMs(url))
  try {
    const res = await fetchWithLocalNetwork(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: pairing.localDeviceId, role: pairing.role }),
      signal: ctrl.signal,
      mode: 'cors',
    })
    if (!res.ok) return
    const parsed = TicketSchema.safeParse(await res.json())
    if (!parsed.success) return
    await saveDevicePairing({
      ...pairing,
      signalHost: parsed.data.signalHost,
      signalToken: parsed.data.signalToken,
      signalPeerId: parsed.data.signalPeerId,
      peerDeviceId: parsed.data.desktopPeerId || pairing.peerDeviceId,
      iceServers: parsed.data.iceServers ?? pairing.iceServers,
    })
  } catch {
    // A reachable hub is optional; the stored ticket keeps working off-LAN.
  } finally {
    clearTimeout(timer)
  }
}
