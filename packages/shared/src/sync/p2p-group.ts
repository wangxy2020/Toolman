import { z } from 'zod'
import { P2pClientDeviceKindSchema, P2pMemberRoleSchema } from '../p2p/types.js'

export const P2pGroupDeviceKindSchema = P2pClientDeviceKindSchema
export type P2pGroupDeviceKind = z.infer<typeof P2pGroupDeviceKindSchema>

/** Member row in a `p2p_group` changelog payload. One row per device. */
export const P2pGroupSyncMemberSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  role: P2pMemberRoleSchema,
  deviceId: z.string().min(1),
  identityId: z.string().min(1).optional(),
  deviceKind: P2pGroupDeviceKindSchema.optional(),
  status: z.enum(['active', 'invited']).optional(),
  online: z.boolean().optional(),
})
export type P2pGroupSyncMember = z.infer<typeof P2pGroupSyncMemberSchema>

/**
 * Changelog payload for `entityKind: 'p2p_group'`.
 * Same-user Sync Hub only: roster + group name. Never include personal notes,
 * knowledge bodies, or other users' shared mirrors — those stay on the mesh WAL.
 */
export const P2pGroupSyncPayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative().optional(),
  members: z.array(P2pGroupSyncMemberSchema).optional(),
  role: P2pMemberRoleSchema.optional(),
  ownerIdentityId: z.string().min(1).optional(),
  ownerDeviceId: z.string().min(1).optional(),
})
export type P2pGroupSyncPayload = z.infer<typeof P2pGroupSyncPayloadSchema>
