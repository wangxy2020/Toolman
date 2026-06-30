import { createHash } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import { eq } from 'drizzle-orm'
import { blobs } from '@toolman/db'
import { copyFileChunkedSync, FILE_IO_CHUNK_SIZE, hashFileBytes } from '@toolman/knowledge'
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

function upsertBlobMetadata(input: {
  hash: string
  mimeType: string
  sizeBytes: number
  originalName?: string | null
}): BlobRecord {
  const db = getDatabase()
  const existing = db.select().from(blobs).where(eq(blobs.hash, input.hash)).get()
  if (!existing) {
    db.insert(blobs)
      .values({
        hash: input.hash,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalName: input.originalName ?? null,
        createdAt: new Date(),
      })
      .run()
  }

  const row = db.select().from(blobs).where(eq(blobs.hash, input.hash)).get()
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

export function ensureBlobRecord(hash: string, mimeType: string, sizeBytes: number): BlobRecord {
  const targetPath = blobFilePath(hash)
  if (!existsSync(targetPath)) {
    throw new Error(`Blob 文件不存在: ${hash}`)
  }

  return upsertBlobMetadata({ hash, mimeType, sizeBytes, originalName: null })
}

export function writeBlobFromBuffer(data: Buffer, mimeType: string): BlobRecord {
  const hash = sha256Hex(data)
  const targetPath = blobFilePath(hash)

  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, data)
  }

  return upsertBlobMetadata({
    hash,
    mimeType,
    sizeBytes: data.byteLength,
    originalName: null,
  })
}

export function writeBlobFromPath(sourcePath: string): BlobRecord {
  if (!existsSync(sourcePath)) {
    throw new Error(`文件不存在: ${sourcePath}`)
  }

  const hash = hashFileBytes(sourcePath)
  const mimeType = guessMimeType(sourcePath)
  const sizeBytes = statSync(sourcePath).size
  const originalName = basename(sourcePath)
  const targetPath = blobFilePath(hash)

  if (!existsSync(targetPath)) {
    copyFileChunkedSync(sourcePath, targetPath)
  }

  return upsertBlobMetadata({
    hash,
    mimeType,
    sizeBytes,
    originalName,
  })
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

export function readBlobBytes(hash: string, maxBytes = 16 * 1024 * 1024): Buffer {
  const path = blobFilePath(hash)
  if (!existsSync(path)) {
    throw new Error(`Blob 不存在: ${hash}`)
  }

  const sizeBytes = statSync(path).size
  if (sizeBytes > maxBytes) {
    throw new Error(`Blob 过大 (${sizeBytes} bytes)，请使用流式读取`)
  }
  const fd = openSync(path, 'r')
  const buffer = Buffer.alloc(sizeBytes)
  try {
    const bytesRead = readSync(fd, buffer, 0, sizeBytes, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    closeSync(fd)
  }
}

export function createBlobReadStream(hash: string) {
  const path = blobFilePath(hash)
  if (!existsSync(path)) {
    throw new Error(`Blob 不存在: ${hash}`)
  }
  return createReadStream(path, { highWaterMark: FILE_IO_CHUNK_SIZE })
}

export function copyBlobToPath(hash: string, targetPath: string): void {
  const sourcePath = blobFilePath(hash)
  if (!existsSync(sourcePath)) {
    throw new Error(`Blob 不存在: ${hash}`)
  }
  copyFileChunkedSync(sourcePath, targetPath)
}

export function getBlobDataUrl(hash: string): string {
  const meta = getBlobMeta(hash)
  if (!meta) {
    throw new Error(`Blob 不存在: ${hash}`)
  }
  let mimeType = meta.mimeType
  if (!mimeType.startsWith('image/')) {
    if (meta.originalName && /\.(png|jpe?g|gif|webp|bmp)$/i.test(meta.originalName)) {
      mimeType = guessMimeType(meta.originalName)
    } else {
      throw new Error('仅支持图片类型 blob')
    }
  }
  const data = readBlobBytes(hash)
  return `data:${mimeType};base64,${data.toString('base64')}`
}
