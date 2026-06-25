import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface PersistedBlobReceiveSession {
  transferId: string
  workspaceId: string
  contentHash: string
  mimeType?: string
  sizeBytes: number
  totalChunks: number
  peerDeviceId: string
  receivedIndices: number[]
  updatedAt: number
}

function sessionsDir(): string {
  const dir = join(app.getPath('userData'), 'p2p', 'blob-sessions')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function sessionPath(transferId: string): string {
  return join(sessionsDir(), `${transferId}.json`)
}

export function loadBlobReceiveSession(transferId: string): PersistedBlobReceiveSession | null {
  const path = sessionPath(transferId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PersistedBlobReceiveSession
  } catch {
    return null
  }
}

export function saveBlobReceiveSession(session: PersistedBlobReceiveSession): void {
  writeFileSync(
    sessionPath(session.transferId),
    JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2),
    'utf8',
  )
}

export function listBlobReceiveSessions(): PersistedBlobReceiveSession[] {
  const dir = sessionsDir()
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'))
  const sessions: PersistedBlobReceiveSession[] = []
  for (const file of files) {
    const transferId = file.replace(/\.json$/, '')
    const session = loadBlobReceiveSession(transferId)
    if (session) {
      sessions.push(session)
    }
  }
  return sessions
}

export function deleteBlobReceiveSession(transferId: string): void {
  const path = sessionPath(transferId)
  if (existsSync(path)) {
    unlinkSync(path)
  }
}
