import { z } from 'zod'

/** Inline file bodies in the snapshot JSON (larger files are downloaded separately). */
export const KNOWLEDGE_SNAPSHOT_INLINE_FILE_MAX_BYTES = 2 * 1024 * 1024
/** Cap total inlined file bytes so a single HTTP JSON response stays usable. */
export const KNOWLEDGE_SNAPSHOT_INLINE_FILE_TOTAL_MAX_BYTES = 32 * 1024 * 1024
/** Per-file download cap when hydrating omitted bodies on the client. */
export const KNOWLEDGE_SNAPSHOT_DOWNLOAD_FILE_MAX_BYTES = 25 * 1024 * 1024

export const KnowledgeSnapshotKbSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.string(),
  documentCount: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  embedModel: z.string().optional(),
  embedDimension: z.number().int().positive().optional(),
})
export type KnowledgeSnapshotKb = z.infer<typeof KnowledgeSnapshotKbSchema>

export const KnowledgeSnapshotDocumentSchema = z.object({
  id: z.string().min(1),
  kbId: z.string().min(1),
  title: z.string(),
  mimeType: z.string().nullable().optional(),
  status: z.string(),
  sourceKind: z.enum(['file', 'url']).default('file'),
  chunkCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  updatedAt: z.number().int().nonnegative(),
})
export type KnowledgeSnapshotDocument = z.infer<typeof KnowledgeSnapshotDocumentSchema>

export const KnowledgeSnapshotChunkSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  kbId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  text: z.string(),
})
export type KnowledgeSnapshotChunk = z.infer<typeof KnowledgeSnapshotChunkSchema>

export const KnowledgeSnapshotVectorSchema = z.object({
  chunkId: z.string().min(1),
  documentId: z.string().min(1),
  kbId: z.string().min(1),
  /** Base64-encoded Float32Array (little-endian). */
  vectorB64: z.string(),
  dimension: z.number().int().positive(),
})
export type KnowledgeSnapshotVector = z.infer<typeof KnowledgeSnapshotVectorSchema>

export const KnowledgeSnapshotFileSchema = z.object({
  documentId: z.string().min(1),
  kbId: z.string().min(1),
  fileName: z.string(),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().int().nonnegative(),
  contentB64: z.string().optional(),
  omitted: z.boolean().optional(),
  omitReason: z.string().optional(),
})
export type KnowledgeSnapshotFile = z.infer<typeof KnowledgeSnapshotFileSchema>

export const KnowledgeSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  kbs: z.array(KnowledgeSnapshotKbSchema),
  documents: z.array(KnowledgeSnapshotDocumentSchema),
  chunks: z.array(KnowledgeSnapshotChunkSchema),
  vectors: z.array(KnowledgeSnapshotVectorSchema),
  files: z.array(KnowledgeSnapshotFileSchema),
})
export type KnowledgeSnapshot = z.infer<typeof KnowledgeSnapshotSchema>

function bytesToB64(bytes: Uint8Array): string {
  if (typeof globalThis.btoa === 'function') {
    let binary = ''
    const chunk = 0x2000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return globalThis.btoa(binary)
  }
  const BufferCtor = (globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (e: string) => string } } })
    .Buffer
  if (BufferCtor) return BufferCtor.from(bytes).toString('base64')
  throw new Error('no base64 encoder')
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
    return out
  }
  const BufferCtor = (globalThis as { Buffer?: { from: (s: string, e: string) => Uint8Array } }).Buffer
  if (BufferCtor) return Uint8Array.from(BufferCtor.from(b64, 'base64'))
  throw new Error('no base64 decoder')
}

export function encodeFloat32Vector(vector: number[]): string {
  const aligned = new Float32Array(vector.length)
  aligned.set(vector)
  return bytesToB64(new Uint8Array(aligned.buffer))
}

export function decodeFloat32Vector(vectorB64: string): number[] {
  const bytes = b64ToBytes(vectorB64)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return Array.from(new Float32Array(copy.buffer))
}

export function bytesToBase64(bytes: Uint8Array): string {
  return bytesToB64(bytes)
}

export function base64ToBytes(b64: string): Uint8Array {
  return b64ToBytes(b64)
}
