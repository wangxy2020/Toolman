import { z } from 'zod'

import { CidPackageManifestSchema } from './manifest.js'

export const CID_WIRE_TOPIC_PREFIX = 'toolman/cid/v1/'

export const CidWireAnnounceSchema = z.object({
  v: z.literal(1),
  manifest: CidPackageManifestSchema,
  signerDid: z.string().min(1),
  publicKey: z.string().min(1),
  deviceId: z.string().uuid(),
  at: z.number().int().positive(),
  signature: z.string().min(1),
})
export type CidWireAnnounce = z.infer<typeof CidWireAnnounceSchema>

export const CidWireManifestRequestSchema = z.object({
  v: z.literal(1),
  rootCid: z.string().optional(),
  resourceId: z.string().optional(),
  requestId: z.string().uuid(),
  at: z.number().int().positive(),
})
export type CidWireManifestRequest = z.infer<typeof CidWireManifestRequestSchema>

export const CidWireManifestResponseSchema = z.object({
  v: z.literal(1),
  requestId: z.string().uuid(),
  manifest: CidPackageManifestSchema.nullable(),
  at: z.number().int().positive(),
})
export type CidWireManifestResponse = z.infer<typeof CidWireManifestResponseSchema>

export const CidWireChunkRequestSchema = z.object({
  v: z.literal(1),
  rootCid: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  chunkCid: z.string().min(1),
  requestId: z.string().uuid(),
  at: z.number().int().positive(),
})
export type CidWireChunkRequest = z.infer<typeof CidWireChunkRequestSchema>

export const CidWireChunkResponseSchema = z.object({
  v: z.literal(1),
  requestId: z.string().uuid(),
  rootCid: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  chunkCid: z.string().min(1),
  data: z.string().min(1),
  signerDid: z.string().min(1),
  publicKey: z.string().min(1),
  deviceId: z.string().uuid(),
  at: z.number().int().positive(),
  signature: z.string().min(1),
})
export type CidWireChunkResponse = z.infer<typeof CidWireChunkResponseSchema>

export function cidWireTopic(name: 'announce' | 'request' | 'response' | 'chunk-request' | 'chunk-response'): string {
  return `${CID_WIRE_TOPIC_PREFIX}${name}`
}

export function buildCidChunkSignedPayload(fields: {
  rootCid: string
  chunkIndex: number
  chunkCid: string
  data: string
  signerDid: string
  publicKey: string
  deviceId: string
  at: number
}): string {
  return [
    'toolman:cid-chunk:v1',
    fields.rootCid,
    String(fields.chunkIndex),
    fields.chunkCid,
    fields.data,
    fields.signerDid,
    fields.publicKey,
    fields.deviceId,
    String(fields.at),
  ].join('|')
}
