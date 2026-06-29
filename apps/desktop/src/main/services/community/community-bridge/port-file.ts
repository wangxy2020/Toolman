import { createServer } from 'node:net'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  COMMUNITY_HUB_DEFAULT_PORT,
  COMMUNITY_HUB_HOST,
  getCommunityHubPortFilePath,
} from '../community-paths'
import type { CommunityHubPortFile } from './types'

export async function readCommunityHubPortFile(
  filePath = getCommunityHubPortFilePath(),
): Promise<CommunityHubPortFile | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as CommunityHubPortFile
  } catch {
    return null
  }
}

export async function writeCommunityHubPortFile(
  value: CommunityHubPortFile,
  filePath = getCommunityHubPortFilePath(),
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export async function removeCommunityHubPortFile(
  filePath = getCommunityHubPortFilePath(),
): Promise<void> {
  try {
    await rm(filePath, { force: true })
  } catch {
    // ignore missing file
  }
}

export async function allocateCommunityHubPort(
  preferred = COMMUNITY_HUB_DEFAULT_PORT,
): Promise<number> {
  const preferredPort = await tryListenOnPort(preferred)
  if (preferredPort !== null) {
    return preferredPort
  }
  const ephemeralPort = await tryListenOnPort(0)
  if (ephemeralPort !== null) {
    return ephemeralPort
  }
  throw new Error('failed to allocate community hub port')
}

function tryListenOnPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(null))
    server.listen(port, COMMUNITY_HUB_HOST, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      server.close(() => resolve(boundPort))
    })
  })
}
