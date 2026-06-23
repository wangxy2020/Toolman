import { z } from 'zod'

import { CommunityYjsDomainSchema, CommunityYjsWireMessageSchema } from './yjs.js'

export const COMMUNITY_YJS_SIGNED_WIRE_VERSION = 2 as const

export const CommunityYjsSignedWireMessageSchema = z.object({
  v: z.literal(COMMUNITY_YJS_SIGNED_WIRE_VERSION),
  domain: CommunityYjsDomainSchema,
  update: z.string().min(1),
  signerDid: z.string().min(1),
  publicKey: z.string().min(1),
  deviceId: z.string().uuid(),
  originPeerId: z.string().optional(),
  at: z.number().int().positive(),
  signature: z.string().min(1),
})
export type CommunityYjsSignedWireMessage = z.infer<typeof CommunityYjsSignedWireMessageSchema>

export type CommunityYjsSignedUpdateFields = Pick<
  CommunityYjsSignedWireMessage,
  'domain' | 'update' | 'signerDid' | 'publicKey' | 'deviceId' | 'at'
>

export function buildCommunityYjsSignedUpdatePayload(
  fields: CommunityYjsSignedUpdateFields,
): string {
  return [
    'toolman:community-yjs:v2',
    fields.domain,
    fields.update,
    fields.signerDid,
    fields.publicKey,
    fields.deviceId,
    String(fields.at),
  ].join('|')
}

export function parseCommunityYjsWireMessage(raw: unknown):
  | { kind: 'signed'; message: CommunityYjsSignedWireMessage }
  | { kind: 'legacy'; message: import('./yjs.js').CommunityYjsWireMessage }
  | { kind: 'invalid' } {
  const signed = CommunityYjsSignedWireMessageSchema.safeParse(raw)
  if (signed.success) {
    return { kind: 'signed', message: signed.data }
  }

  const legacy = CommunityYjsWireMessageSchema.safeParse(raw)
  if (legacy.success) {
    return { kind: 'legacy', message: legacy.data }
  }

  return { kind: 'invalid' }
}
