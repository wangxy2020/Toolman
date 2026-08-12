export type AuthRegion = 'cn' | 'intl'
export type ProductSku = 'community' | 'pro'
export type AuthAccountKind = 'email' | 'phone'
/** Align with `@toolman/shared` CommunityUserRole. */
export type CommunityUserRole = 'guest' | 'user' | 'enterprise' | 'admin' | 'founder'

export type MobileAuthSession = {
  identityId: string
  displayName: string
  /** Login identifier shown in UI (email or phone). */
  email: string
  phone: string | null
  accountKind: AuthAccountKind
  accessToken: string
  region: AuthRegion
  subscriptionSku: ProductSku
  entitlements: string[]
  /** Community Hub / Authing role; drives admin sidebar visibility. */
  communityRole: CommunityUserRole | null
  lastLoginAt: number
}

export type MobileAuthAccountRecord = {
  identityId: string
  displayName: string
  /** Canonical login key (normalized email or phone digits). */
  accountKey: string
  accountKind: AuthAccountKind
  email: string
  phone: string | null
  /** SHA-256 hex of `salt:password` */
  passwordHash: string
  salt: string
  region: AuthRegion
  subscriptionSku: ProductSku
  entitlements: string[]
  communityRole: CommunityUserRole | null
  createdAt: number
  updatedAt: number
}

export type MobileAuthStore = {
  accounts: MobileAuthAccountRecord[]
  session: MobileAuthSession | null
}
