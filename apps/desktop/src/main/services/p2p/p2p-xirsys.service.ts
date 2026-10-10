import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL } from 'node:url'

import {
  P2pIceServerSchema,
  type P2pIceServer,
  type P2pXirsysConfig,
} from '@toolman/shared'

/** Xirsys caps dynamic TURN credentials at six hours. */
const XIRSYS_TURN_TTL_SEC = 21_600

interface XirsysIceEntry {
  username?: string
  credential?: string
  urls?: string | string[]
}

interface XirsysTurnResponse {
  s?: string
  v?: {
    iceServers?: XirsysIceEntry | XirsysIceEntry[]
  }
}

function httpPutJson(url: string, authHeader: string, body: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requestFn(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            reject(new Error(`Xirsys API HTTP ${res.statusCode ?? 'unknown'}: ${text.slice(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(text) as unknown)
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export function parseXirsysIceServers(payload: unknown): P2pIceServer[] {
  const data = payload as XirsysTurnResponse
  if (data.s !== 'ok' || !data.v?.iceServers) {
    throw new Error('Xirsys API returned an unexpected response')
  }

  const entries = Array.isArray(data.v.iceServers) ? data.v.iceServers : [data.v.iceServers]
  const servers: P2pIceServer[] = []
  for (const entry of entries) {
    const urls = Array.isArray(entry.urls) ? entry.urls : entry.urls ? [entry.urls] : []
    if (urls.length === 0) continue
    const needsCredential = urls.some((url) => /^turns?:/i.test(url))
    if (needsCredential && (!entry.username || !entry.credential)) continue
    servers.push(
      P2pIceServerSchema.parse({
        urls,
        ...(entry.username && entry.credential
          ? { username: entry.username, credential: entry.credential }
          : {}),
      }),
    )
  }
  if (servers.length === 0) {
    throw new Error('Xirsys ICE payload is missing urls or credentials')
  }
  return servers
}

export async function fetchXirsysIceServers(config: P2pXirsysConfig): Promise<P2pIceServer[]> {
  const base = config.path.replace(/\/$/, '')
  const url = `${base}/_turn/${encodeURIComponent(config.channel)}?webrtc=1&expire=${XIRSYS_TURN_TTL_SEC}`
  const auth = `Basic ${Buffer.from(`${config.ident}:${config.secret}`).toString('base64')}`
  const payload = await httpPutJson(url, auth, JSON.stringify({ format: 'urls' }))
  return parseXirsysIceServers(payload)
}
