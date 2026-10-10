/**
 * Browser side of the personal signaling room. The token was minted on the
 * desktop; this module only sends sealed mailbox ciphertext.
 */
import {
  encodePersonalSignalWire,
  readPersonalSignalWire,
  xirsysSignalSocketUrl,
  type DevicePairingRecord,
} from '@toolman/shared'

const MAX_QUEUED = 40
const queue: string[] = []
let socket: WebSocket | null = null
let activeKey = ''
let opening: Promise<boolean> | null = null

export function drainPersonalSignalCiphertexts(): string[] {
  return queue.splice(0, queue.length)
}

export async function ensurePersonalSignalSocket(pairing: DevicePairingRecord): Promise<boolean> {
  const host = pairing.signalHost
  const token = pairing.signalToken
  const peerId = pairing.signalPeerId
  if (!host || !token || !peerId || typeof WebSocket === 'undefined') return false
  let url = ''
  try {
    url = xirsysSignalSocketUrl(host, token)
  } catch {
    return false
  }
  const key = `${peerId}|${url}`
  if (socket && socket.readyState === WebSocket.OPEN && activeKey === key) return true
  if (opening && activeKey === key) return opening
  if (socket) {
    socket.close()
    socket = null
  }
  activeKey = key
  opening = openSocket(url, peerId).finally(() => {
    opening = null
  })
  return opening
}

export async function sendPersonalSignalCiphertext(
  pairing: DevicePairingRecord,
  recipientPeerId: string,
  ciphertextB64: string,
): Promise<boolean> {
  const ready = await ensurePersonalSignalSocket(pairing)
  if (!ready || !socket || socket.readyState !== WebSocket.OPEN || !pairing.signalPeerId) return false
  socket.send(
    encodePersonalSignalWire({
      from: pairing.signalPeerId,
      to: recipientPeerId,
      ciphertextB64,
    }),
  )
  return true
}

function openSocket(url: string, peerId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const next = new WebSocket(url)
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (ok) socket = next
      resolve(ok)
    }
    const timer = setTimeout(() => {
      next.close()
      finish(false)
    }, 8_000)
    next.addEventListener('open', () => finish(true))
    next.addEventListener('error', () => finish(false))
    next.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      const wire = raw ? readPersonalSignalWire(raw, peerId) : null
      if (!wire) return
      queue.push(wire.ciphertextB64)
      if (queue.length > MAX_QUEUED) queue.splice(0, queue.length - MAX_QUEUED)
    })
    next.addEventListener('close', () => {
      if (socket === next) socket = null
      finish(false)
    })
  })
}
