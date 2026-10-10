/**
 * Mint Xirsys Signaling V2 tokens. The account secret is used only on this
 * request and is never written into a pairing offer.
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'
import {
  PERSONAL_SIGNAL_TOKEN_TTL_SEC,
  readXirsysOkString,
  toErrorMessage,
  xirsysSignalHostUrl,
  xirsysSignalTokenUrl,
  type DevicePairingOffer,
} from '@toolman/shared'
import { ensureFreshP2pIceServers, getConfiguredXirsys } from './p2p-network.config'
import { logStructured } from '../structured-log.service'

export type XirsysSignalAccess = {
  host: string
  token: string
  peerId: string
}

let cachedHost: string | null = null

function httpJson(method: 'GET' | 'PUT', url: string, authHeader: string, body = ''): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requestFn(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: {
          Authorization: authHeader,
          ...(body
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            reject(new Error(`Xirsys signal HTTP ${res.statusCode ?? 'unknown'}: ${text.slice(0, 180)}`))
            return
          }
          try {
            resolve(text ? (JSON.parse(text) as unknown) : {})
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        })
      },
    )
    req.setTimeout(12_000, () => {
      req.destroy(new Error('Xirsys signal request timed out'))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function signalHost(apiPath: string, authHeader: string): Promise<string> {
  if (cachedHost) return cachedHost
  const payload = await httpJson('GET', xirsysSignalHostUrl(apiPath), authHeader)
  const host = readXirsysOkString(payload)
  if (!host || !/^wss:\/\//i.test(host)) {
    throw new Error('Xirsys signal host missing')
  }
  cachedHost = host
  return host
}

export async function mintXirsysSignalAccess(
  peerId: string,
  expireSec = PERSONAL_SIGNAL_TOKEN_TTL_SEC,
): Promise<XirsysSignalAccess | null> {
  const config = getConfiguredXirsys()
  const peer = peerId.trim()
  if (!config || !peer) return null
  const auth = `Basic ${Buffer.from(`${config.ident}:${config.secret}`).toString('base64')}`
  const host = await signalHost(config.path, auth)
  const payload = await httpJson(
    'PUT',
    xirsysSignalTokenUrl(config.path, config.channel, peer, expireSec),
    auth,
    '{}',
  )
  const token = readXirsysOkString(payload)
  if (!token) throw new Error('Xirsys signal token missing')
  return { host, token, peerId: peer }
}

export async function withPersonalSignalTicket(
  offer: DevicePairingOffer,
  peerId: string,
): Promise<DevicePairingOffer> {
  let iceServers = offer.iceServers
  try {
    const fresh = (await ensureFreshP2pIceServers()).slice(0, 8)
    if (fresh.length > 0) iceServers = fresh
  } catch {
    // Keep the ICE list already on the offer.
  }
  try {
    const ticket = await mintXirsysSignalAccess(peerId)
    if (!ticket) return { ...offer, iceServers }
    return {
      ...offer,
      signalHost: ticket.host,
      signalToken: ticket.token,
      signalPeerId: ticket.peerId,
      iceServers,
    }
  } catch (error) {
    logStructured('p2p', 'warn', `personal signal ticket failed: ${toErrorMessage(error, String(error))}`)
    return { ...offer, iceServers }
  }
}

export function resetXirsysSignalHostCache(): void {
  cachedHost = null
}
