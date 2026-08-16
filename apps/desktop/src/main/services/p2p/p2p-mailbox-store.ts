import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export type MailboxRecord = {
  workspaceId: string
  recipientDeviceId: string
  seq: number
  ciphertextB64: string
  depositedAt: number
}

const MAX_PER_RECIPIENT = 500
const records: MailboxRecord[] = []
let hydrated = false

function storePath(): string | null {
  try {
    return join(app.getPath('userData'), 'p2p', 'mailbox.json')
  } catch {
    return null
  }
}

function persist(): void {
  const path = storePath()
  if (!path) return
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(records))
  } catch {
    // ignore
  }
}

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  const path = storePath()
  if (!path || !existsSync(path)) return
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const item = row as Partial<MailboxRecord>
      if (
        typeof item.workspaceId !== 'string' ||
        typeof item.recipientDeviceId !== 'string' ||
        typeof item.seq !== 'number' ||
        typeof item.ciphertextB64 !== 'string'
      ) {
        continue
      }
      records.push({
        workspaceId: item.workspaceId,
        recipientDeviceId: item.recipientDeviceId,
        seq: item.seq,
        ciphertextB64: item.ciphertextB64,
        depositedAt: typeof item.depositedAt === 'number' ? item.depositedAt : Date.now(),
      })
    }
  } catch {
    // ignore
  }
}

export function putMailboxRecord(input: MailboxRecord): boolean {
  hydrate()
  const existing = records.findIndex(
    (row) =>
      row.workspaceId === input.workspaceId &&
      row.recipientDeviceId === input.recipientDeviceId &&
      row.seq === input.seq,
  )
  if (existing >= 0) {
    records[existing] = input
  } else {
    records.push(input)
  }
  const mine = records.filter(
    (row) =>
      row.workspaceId === input.workspaceId && row.recipientDeviceId === input.recipientDeviceId,
  )
  if (mine.length > MAX_PER_RECIPIENT) {
    mine
      .sort((a, b) => a.seq - b.seq)
      .slice(0, mine.length - MAX_PER_RECIPIENT)
      .forEach((old) => {
        const index = records.indexOf(old)
        if (index >= 0) records.splice(index, 1)
      })
  }
  persist()
  return true
}

export function pullMailboxRecords(input: {
  workspaceId: string
  recipientDeviceId: string
  sinceSeq?: number
  limit?: number
}): MailboxRecord[] {
  hydrate()
  const since = input.sinceSeq ?? 0
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  return records
    .filter(
      (row) =>
        row.workspaceId === input.workspaceId &&
        row.recipientDeviceId === input.recipientDeviceId &&
        row.seq > since,
    )
    .sort((a, b) => a.seq - b.seq)
    .slice(0, limit)
}

export function resetMailboxStoreForTests(): void {
  records.splice(0, records.length)
  hydrated = true
}
