import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'
import { isToolmanDid } from '@toolman/shared'

const BlockedDidsSchema = z.object({
  blockedDids: z.array(z.string()).default([]),
})

function getBlockedDidsPath(): string {
  return join(app.getPath('userData'), 'community', 'blocked-dids.json')
}

function readBlockedDidsFile(): Set<string> {
  const path = getBlockedDidsPath()
  if (!existsSync(path)) return new Set()

  try {
    const parsed = BlockedDidsSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    return new Set(parsed.blockedDids.filter(isToolmanDid))
  } catch {
    return new Set()
  }
}

let blockedDids: Set<string> | undefined

function ensureBlockedDidsLoaded(): Set<string> {
  if (!blockedDids) {
    blockedDids = readBlockedDidsFile()
  }
  return blockedDids
}

export function reloadBlockedDids(): void {
  blockedDids = readBlockedDidsFile()
}

export function listBlockedDids(): string[] {
  return [...ensureBlockedDidsLoaded()]
}

export function getBlockedDidCount(): number {
  return ensureBlockedDidsLoaded().size
}

export function isDidBlocked(did: string): boolean {
  return ensureBlockedDidsLoaded().has(did)
}

export function blockDid(did: string): void {
  if (!isToolmanDid(did)) {
    throw new Error('Invalid Toolman DID')
  }
  const set = ensureBlockedDidsLoaded()
  set.add(did)
  writeFileSync(
    getBlockedDidsPath(),
    JSON.stringify({ blockedDids: [...set] }, null, 2),
    'utf8',
  )
}

export function unblockDid(did: string): void {
  const set = ensureBlockedDidsLoaded()
  set.delete(did)
  writeFileSync(
    getBlockedDidsPath(),
    JSON.stringify({ blockedDids: [...set] }, null, 2),
    'utf8',
  )
}
