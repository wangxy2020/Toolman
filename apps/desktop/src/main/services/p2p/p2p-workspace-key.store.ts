import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { decryptSecret, encryptSecret } from '../secret-store'
import { setWorkspaceKey } from './p2p-crypto.service'

interface WorkspaceKeyEntry {
  encryptedKey: string
  keyVersion: number
}

type WorkspaceKeyStore = Record<string, WorkspaceKeyEntry>

function getStorePath(): string {
  const dir = join(app.getPath('userData'), 'p2p')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'workspace-keys.json')
}

function readStore(): WorkspaceKeyStore {
  const path = getStorePath()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, 'utf8')
    return JSON.parse(raw) as WorkspaceKeyStore
  } catch {
    return {}
  }
}

function writeStore(store: WorkspaceKeyStore): void {
  writeFileSync(getStorePath(), JSON.stringify(store, null, 2), 'utf8')
}

export function saveWorkspaceKey(
  workspaceId: string,
  workspaceKeyBase64: string,
  keyVersion = 1,
): void {
  const store = readStore()
  store[workspaceId] = {
    encryptedKey: encryptSecret(workspaceKeyBase64),
    keyVersion,
  }
  writeStore(store)
  setWorkspaceKey(workspaceId, workspaceKeyBase64, keyVersion)
}

export function loadWorkspaceKey(workspaceId: string): string | null {
  const entry = readStore()[workspaceId]
  if (!entry) return null
  return decryptSecret(entry.encryptedKey)
}

export function removeWorkspaceKey(workspaceId: string): void {
  const store = readStore()
  if (!store[workspaceId]) return
  delete store[workspaceId]
  writeStore(store)
}

export function loadAllWorkspaceKeys(): void {
  const store = readStore()
  for (const [workspaceId, entry] of Object.entries(store)) {
    const key = decryptSecret(entry.encryptedKey)
    if (key) {
      setWorkspaceKey(workspaceId, key, entry.keyVersion)
    }
  }
}
