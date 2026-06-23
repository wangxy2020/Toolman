import { z } from 'zod'

import { computeRootCidFromChunkCids } from './cid.js'
import { CidChunkDescriptorSchema, chunkBytes } from './chunk.js'

export const CidPackageManifestSchema = z.object({
  v: z.literal(1),
  packageId: z.string().min(1),
  resourceId: z.string().optional(),
  resourceType: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  rootCid: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  localPath: z.string().optional(),
  chunks: z.array(CidChunkDescriptorSchema).min(1),
  signerDid: z.string().optional(),
  publicKey: z.string().optional(),
  deviceId: z.string().uuid().optional(),
  at: z.number().int().positive().optional(),
  signature: z.string().optional(),
})
export type CidPackageManifest = z.infer<typeof CidPackageManifestSchema>

export function buildCidPackageManifest(input: {
  packageId: string
  resourceId?: string
  resourceType?: string
  name: string
  version: string
  data: Uint8Array
  localPath?: string
}): CidPackageManifest {
  const chunks = chunkBytes(input.data)
  const rootCid = computeRootCidFromChunkCids(chunks.map((chunk) => chunk.cid))

  return CidPackageManifestSchema.parse({
    v: 1,
    packageId: input.packageId,
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    name: input.name,
    version: input.version,
    rootCid,
    sizeBytes: input.data.length,
    localPath: input.localPath,
    chunks,
  })
}

export function buildCidManifestSignedPayload(manifest: CidPackageManifest): string {
  const chunkSummary = manifest.chunks.map((chunk) => `${chunk.index}:${chunk.cid}:${chunk.size}`).join(',')
  return [
    'toolman:cid-manifest:v1',
    manifest.packageId,
    manifest.version,
    manifest.rootCid,
    String(manifest.sizeBytes),
    chunkSummary,
  ].join('|')
}
