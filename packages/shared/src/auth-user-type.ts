import { z } from 'zod'

import { CommunityUserRoleSchema } from './ipc/community.js'

/** Display / entitlement user type (account center). */
export const AuthUserTypeSchema = z.enum([
  'guest',
  'normal',
  'vip',
  'admin',
  'super_admin',
])
export type AuthUserType = z.infer<typeof AuthUserTypeSchema>

const AuthingSubscriptionSkuSchema = z.enum(['community', 'pro'])

export const AuthingRoleProfileSchema = z.object({
  userType: AuthUserTypeSchema,
  communityRole: CommunityUserRoleSchema.optional(),
  subscriptionSku: AuthingSubscriptionSkuSchema.optional(),
  entitlements: z.array(z.string()).optional(),
  priority: z.number().int().nonnegative(),
})
export type AuthingRoleProfile = z.infer<typeof AuthingRoleProfileSchema>

export interface ResolvedAuthingRoleProfile {
  userType: AuthUserType
  communityRole?: z.infer<typeof CommunityUserRoleSchema>
  subscriptionSku?: z.infer<typeof AuthingSubscriptionSkuSchema>
  entitlements: string[]
  matchedRoles: string[]
}
