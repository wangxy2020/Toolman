import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL } from 'node:url'

import {
  P2pIceServerSchema,
  type P2pIceServer,
  type P2pXirsysConfig,
} from '@toolman/shared'

interface XirsysTurnResponse {
  s?: string
  v?: {
    iceServers?: {
      username?: string
      credential?: string
      urls?: string | string[]
    }
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

  const entry = data.v.iceServers
  const urls = Array.isArray(entry.urls) ? entry.urls : entry.urls ? [entry.urls] : []
  if (urls.length === 0 || !entry.username || !entry.credential) {
    throw new Error('Xirsys ICE payload is missing urls or credentials')
  }

  return [
    P2pIceServerSchema.parse({
      urls,
      username: entry.username,
      credential: entry.credential,
    }),
  ]
}

export async function fetchXirsysIceServers(config: P2pXirsysConfig): Promise<P2pIceServer[]> {
  const base = config.path.replace(/\/$/, '')
  const url = `${base}/_turn/${encodeURIComponent(config.channel)}`
  const auth = `Basic ${Buffer.from(`${config.ident}:${config.secret}`).toString('base64')}`
  const payload = await httpPutJson(url, auth, JSON.stringify({ format: 'urls' }))
  return parseXirsysIceServers(payload)
}
