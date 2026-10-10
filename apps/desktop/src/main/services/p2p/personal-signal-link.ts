/**
 * Desktop side of the personal signaling room. Payloads are sealed mailbox
 * ciphertext; this socket only rendezvous the two peers.
 */
import {
  encodePersonalSignalWire,
  readPersonalSignalWire,
  toErrorMessage,
  xirsysSignalSocketUrl,
} from '@toolman/shared'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { mintXirsysSignalAccess } from './p2p-xirsys-signal.service'
import { logStructured } from '../structured-log.service'

type SignalHandler = (ciphertextB64: string) => void

const RECONNECT_MS = 8_000
let handler: SignalHandler | null = null
let socket: WebSocket | null = null
let connecting: Promise<boolean> | null = null
let stopped = true
let localPeerId = ''
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let loggedFailure = false

export function setPersonalSignalHandler(next: SignalHandler): void {
  handler = next
}

export function startPersonalSignalLink(): void {
  stopped = false
  void ensurePersonalSignalConnected()
}

export function stopPersonalSignalLink(): void {
  stopped = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
}

export function sendPersonalSignalCiphertext(recipientPeerId: string, ciphertextB64: string): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN || !localPeerId) return false
  const to = recipientPeerId.trim()
  if (!to || !ciphertextB64) return false
  socket.send(encodePersonalSignalWire({ from: localPeerId, to, ciphertextB64 }))
  return true
}

export async function ensurePersonalSignalConnected(): Promise<boolean> {
  if (stopped) return false
  if (socket && socket.readyState === WebSocket.OPEN) return true
  if (connecting) return connecting
  connecting = openSignalSocket().finally(() => {
    connecting = null
  })
  return connecting
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void ensurePersonalSignalConnected()
  }, RECONNECT_MS)
}

async function openSignalSocket(): Promise<boolean> {
  if (typeof WebSocket === 'undefined') return false
  const local = getP2pDeviceInfo()
  try {
    const access = await mintXirsysSignalAccess(local.deviceId, 60 * 60)
    if (!access) {
      scheduleReconnect()
      return false
    }
    const url = xirsysSignalSocketUrl(access.host, access.token)
    localPeerId = local.deviceId
    await new Promise<void>((resolve, reject) => {
      const next = new WebSocket(url)
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          next.close()
          reject(error)
          return
        }
        socket = next
        loggedFailure = false
        resolve()
      }
      const timer = setTimeout(() => finish(new Error('signal socket timed out')), 10_000)
      next.addEventListener('open', () => finish())
      next.addEventListener('error', () => finish(new Error('signal socket failed')))
      next.addEventListener('message', (event) => {
        const raw = typeof event.data === 'string' ? event.data : ''
        const wire = raw ? readPersonalSignalWire(raw, localPeerId) : null
        if (wire) handler?.(wire.ciphertextB64)
      })
      next.addEventListener('close', () => {
        if (!settled) finish(new Error('signal socket closed'))
        if (socket === next) socket = null
        scheduleReconnect()
      })
    })
    return true
  } catch (error) {
    if (!loggedFailure) {
      loggedFailure = true
      logStructured('p2p', 'warn', `personal signal link failed: ${toErrorMessage(error, String(error))}`)
    }
    scheduleReconnect()
    return false
  }
}
