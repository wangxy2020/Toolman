import { createServer, type Server } from 'node:http'
import { logStructured } from './structured-log.service'
import { isMobileSyncEnabled } from './mobile-sync.service'
import {
  ensureMobileSyncHubToken,
  isMobileSyncLanAccessEnabled,
  resolveMobileSyncListenHost,
  resolveMobileSyncPort,
} from './mobile-sync.config'
import { advertisedHttpUrls } from './network-advertise'
import { sendJson } from './mobile-sync-hub-http'
import { handleRequest } from './mobile-sync-hub-routes'

let server: Server | null = null
let listenPort: number | null = null
let listenHost: string | null = null

export function getMobileSyncHubPort(): number {
  return resolveMobileSyncPort()
}

export function getMobileSyncHubBaseUrl(): string | null {
  if (!listenPort) return null
  return `http://127.0.0.1:${listenPort}`
}

export async function startMobileSyncHub(): Promise<{ baseUrl: string } | null> {
  if (!isMobileSyncEnabled()) return null
  const host = resolveMobileSyncListenHost()
  const port = getMobileSyncHubPort()
  if (server && listenHost === host && listenPort === port) {
    return { baseUrl: `http://127.0.0.1:${listenPort}` }
  }
  if (server) await stopMobileSyncHub()

  ensureMobileSyncHubToken()
  server = createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      logStructured('mobile-sync', 'warn', `hub request failed: ${String(error)}`)
      sendJson(res, 500, { error: 'internal error' }, req)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(port, host, () => resolve())
  })
  listenPort = port
  listenHost = host
  const urls = isMobileSyncLanAccessEnabled()
    ? advertisedHttpUrls(port)
    : [`http://127.0.0.1:${port}`]
  logStructured('mobile-sync', 'warn', `Sync Hub listening: ${urls.join(', ')}`)
  return { baseUrl: `http://127.0.0.1:${port}` }
}

export async function stopMobileSyncHub(): Promise<void> {
  if (!server) return
  const current = server
  server = null
  listenPort = null
  listenHost = null
  await new Promise<void>((resolve) => current.close(() => resolve()))
}
