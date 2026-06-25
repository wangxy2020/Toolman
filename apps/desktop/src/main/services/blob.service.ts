import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import { eq } from 'drizzle-orm'
import { blobs } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'

export function getBlobsDir(): string {
  const dir = join(app.getPath('userData'), 'storage', 'blobs')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function blobFilePath(hash: string): string {
  const prefix = hash.slice(0, 2)
  const dir = join(getBlobsDir(), prefix)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, hash)
}

function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.wps')) return 'application/wps-office.doc'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (lower.endsWith('.md')) return 'text/markdown'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

export interface BlobRecord {
  hash: string
  mimeType: string
  sizeBytes: number
  originalName?: string | null
  createdAt: number
}

export function getBlobStoragePath(hash: string): string {
  return blobFilePath(hash)
}

export function ensureBlobRecord(hash: string, mimeType: string, sizeBytes: number): BlobRecord {
  const targetPath = blobFilePath(hash)
  if (!existsSync(targetPath)) {
    throw new Error(`Blob 文件不存在: ${hash}`)
  }

  const db = getDatabase()
  const existing = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!existing) {
    db.insert(blobs)
      .values({
        hash,
        mimeType,
        sizeBytes,
        originalName: null,
        createdAt: new Date(),
      })
      .run()
  }

  const row = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!row) {
    throw new Error('写入 blob 元数据失败')
  }

  return {
    hash: row.hash,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.getTime(),
  }
}

export function writeBlobFromBuffer(data: Buffer, mimeType: string): BlobRecord {
  const hash = sha256Hex(data)
  const targetPath = blobFilePath(hash)

  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, data)
  }

  const db = getDatabase()
  const existing = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!existing) {
    db.insert(blobs)
      .values({
        hash,
        mimeType,
        sizeBytes: data.byteLength,
        originalName: null,
        createdAt: new Date(),
      })
      .run()
  }

  const row = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!row) {
    throw new Error('写入 blob 元数据失败')
  }

  return {
    hash: row.hash,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.getTime(),
  }
}

export function writeBlobFromPath(sourcePath: string): BlobRecord {
  if (!existsSync(sourcePath)) {
    throw new Error(`文件不存在: ${sourcePath}`)
  }

  const data = readFileSync(sourcePath)
  const hash = sha256Hex(data)
  const mimeType = guessMimeType(sourcePath)
  const sizeBytes = data.byteLength
  const originalName = basename(sourcePath)
  const targetPath = blobFilePath(hash)

  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, data)
  }

  const db = getDatabase()
  const existing = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!existing) {
    db.insert(blobs)
      .values({
        hash,
        mimeType,
        sizeBytes,
        originalName,
        createdAt: new Date(),
      })
      .run()
  }

  const row = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!row) {
    throw new Error('写入 blob 元数据失败')
  }

  return {
    hash: row.hash,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.getTime(),
  }
}

export function getBlobMeta(hash: string): BlobRecord | null {
  const db = getDatabase()
  const row = db.select().from(blobs).where(eq(blobs.hash, hash)).get()
  if (!row) return null

  return {
    hash: row.hash,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.getTime(),
  }
}

export function blobExists(hash: string): boolean {
  return existsSync(blobFilePath(hash))
}

export function readBlobBytes(hash: string): Buffer {
  const path = blobFilePath(hash)
  if (!existsSync(path)) {
    throw new Error(`Blob 不存在: ${hash}`)
  }
  return readFileSync(path)
}

export function getBlobDataUrl(hash: string): string {
  const meta = getBlobMeta(hash)
  if (!meta) {
    throw new Error(`Blob 不存在: ${hash}`)
  }
  if (!meta.mimeType.startsWith('image/')) {
    throw new Error('仅支持图片类型 blob')
  }
  const data = readBlobBytes(hash)
  return `data:${meta.mimeType};base64,${data.toString('base64')}`
}

export function getBlobStorageBytes(): number {
  const dir = getBlobsDir()
  if (!existsSync(dir)) return 0

  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        total += statSync(fullPath).size
      }
    }
  }
  return total
}
