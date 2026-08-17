import { z } from 'zod'
import { P2pClientDeviceKindSchema, P2pMemberRoleSchema } from '../p2p/types.js'
import { isPrivateOrLoopbackHostname, normalizeSyncBaseUrl } from './endpoints.js'

/** Invite-authenticated join register on the owner's Sync Hub. */
export const P2P_JOIN_REGISTER_PATH = '/api/v1/sync/p2p/register-invited-member'

export const P2pJoinDeviceKindSchema = P2pClientDeviceKindSchema
export type P2pJoinDeviceKind = z.infer<typeof P2pJoinDeviceKindSchema>

export const P2pJoinRegisterInputSchema = z.object({
  inviteToken: z.string().min(1),
  displayName: z.string().min(1),
  deviceId: z.string().min(1),
  identityId: z.string().min(1).optional(),
  deviceKind: P2pJoinDeviceKindSchema.default('mobile'),
  publicKeyB64: z.string().min(40).optional(),
})
export type P2pJoinRegisterInput = z.infer<typeof P2pJoinRegisterInputSchema>

export const P2pJoinRegisterMemberSchema = z.object({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  identityId: z.string().min(1),
  displayName: z.string().min(1),
  role: P2pMemberRoleSchema,
  status: z.enum(['invited', 'active']),
  deviceKind: P2pJoinDeviceKindSchema.optional(),
})
export type P2pJoinRegisterMember = z.infer<typeof P2pJoinRegisterMemberSchema>

export const P2pJoinIceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().min(1).optional(),
  credential: z.string().min(1).optional(),
})

export const P2pJoinRegisterOutputSchema = z.object({
  ok: z.literal(true),
  workspaceId: z.string().min(1),
  workspaceName: z.string().optional(),
  member: P2pJoinRegisterMemberSchema,
  inviteId: z.string().min(1).optional(),
  ownerDeviceId: z.string().min(1).optional(),
  offerSdp: z.string().min(1).optional(),
  workspaceKeyB64: z.string().min(1).optional(),
  iceServers: z.array(P2pJoinIceServerSchema).optional(),
  ownerIdentityId: z.string().min(1).optional(),
  members: z.array(P2pJoinRegisterMemberSchema).optional(),
})
export type P2pJoinRegisterOutput = z.infer<typeof P2pJoinRegisterOutputSchema>

/** Invite-authenticated WebRTC answer for the owner's pending offer. */
export const P2P_JOIN_INVITE_ANSWER_PATH = '/api/v1/sync/p2p/invite-answer'

export const P2pJoinInviteAnswerInputSchema = z.object({
  inviteToken: z.string().min(1),
  answerSdp: z.string().min(1),
  deviceId: z.string().min(1),
  identityId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
})
export type P2pJoinInviteAnswerInput = z.infer<typeof P2pJoinInviteAnswerInputSchema>

export const P2pJoinInviteAnswerOutputSchema = z.object({
  ok: z.literal(true),
  inviteId: z.string().min(1),
  workspaceId: z.string().min(1),
})
export type P2pJoinInviteAnswerOutput = z.infer<typeof P2pJoinInviteAnswerOutputSchema>

export function isAllowedInviteHubUrl(raw: string): boolean {
  try {
    const url = new URL(normalizeSyncBaseUrl(raw))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return isPrivateOrLoopbackHostname(url.hostname)
  } catch {
    return false
  }
}

export function normalizeInviteHubUrls(raw: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const item of raw) {
    const url = item ? normalizeSyncBaseUrl(item) : ''
    if (!url || !isAllowedInviteHubUrl(url) || out.includes(url)) continue
    out.push(url)
  }
  return out
}
