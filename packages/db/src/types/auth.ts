import type { InferSelectModel } from 'drizzle-orm'

import type { authBindings, authSessions } from '../schema/auth.js'

export type AuthBindingRow = InferSelectModel<typeof authBindings>
export type AuthSessionRow = InferSelectModel<typeof authSessions>

export type AuthProvider = AuthBindingRow['provider']
export type AuthRegion = NonNullable<AuthSessionRow['preferredRegion']>
export type RegistrationStatus = 'guest' | 'registered'
export type ProductSku = 'community' | 'pro'

export interface AuthBindingMetadata {
  label?: string
  email?: string
  phone?: string
  wechatNickname?: string
  authingRoles?: string[]
  userType?: string
  communityRole?: string
  authingRolesSyncedAt?: number
  [key: string]: unknown
}
