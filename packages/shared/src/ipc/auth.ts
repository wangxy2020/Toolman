import { z } from 'zod'

import { TimestampSchema, UuidSchema } from './base.js'

export const AuthRegionSchema = z.enum(['cn', 'intl'])
export type AuthRegion = z.infer<typeof AuthRegionSchema>

export const AuthProviderSchema = z.enum([
  'firebase_email',
  'firebase_google',
  'firebase_apple',
  'tencent_phone',
  'tencent_wechat',
  'tencent_douyin',
])
export type AuthProvider = z.infer<typeof AuthProviderSchema>

export const RegistrationStatusSchema = z.enum(['guest', 'registered'])
export type RegistrationStatus = z.infer<typeof RegistrationStatusSchema>

export const ProductSkuSchema = z.enum(['community', 'pro'])
export type ProductSku = z.infer<typeof ProductSkuSchema>

export const AuthBindingSummarySchema = z.object({
  provider: AuthProviderSchema,
  subjectId: z.string().min(1),
  label: z.string().optional(),
  verifiedAt: TimestampSchema,
})
export type AuthBindingSummary = z.infer<typeof AuthBindingSummarySchema>

export const AuthSessionSchema = z.object({
  registrationStatus: RegistrationStatusSchema,
  identityId: UuidSchema,
  authRegion: AuthRegionSchema.nullable(),
  subscriptionSku: ProductSkuSchema.nullable(),
  entitlements: z.array(z.string()),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  bindings: z.array(AuthBindingSummarySchema),
  isLoggedIn: z.boolean(),
  preferredRegion: AuthRegionSchema.nullable().optional(),
  tokenExpiresAt: TimestampSchema.nullable().optional(),
  lastLoginAt: TimestampSchema.nullable().optional(),
})
export type AuthSession = z.infer<typeof AuthSessionSchema>

export const AuthGetSessionOutputSchema = AuthSessionSchema
export type AuthGetSessionOutput = z.infer<typeof AuthGetSessionOutputSchema>

export const AuthLoginInputSchema = z.object({
  region: AuthRegionSchema,
  method: AuthProviderSchema,
  payload: z.record(z.unknown()).optional(),
})
export type AuthLoginInput = z.infer<typeof AuthLoginInputSchema>

export const AuthLoginOutputSchema = z.object({
  session: AuthSessionSchema,
})
export type AuthLoginOutput = z.infer<typeof AuthLoginOutputSchema>

export const AuthLogoutInputSchema = z.object({
  localOnly: z.boolean().optional(),
})
export type AuthLogoutInput = z.infer<typeof AuthLogoutInputSchema>

export const AuthLogoutOutputSchema = z.object({
  session: AuthSessionSchema,
})
export type AuthLogoutOutput = z.infer<typeof AuthLogoutOutputSchema>

export const AuthDeleteAccountInputSchema = z.object({
  confirmation: z.literal('DELETE'),
  reauthToken: z.string().min(1).optional(),
})
export type AuthDeleteAccountInput = z.infer<typeof AuthDeleteAccountInputSchema>

export const AuthDeleteAccountOutputSchema = z.object({
  session: AuthSessionSchema,
})
export type AuthDeleteAccountOutput = z.infer<typeof AuthDeleteAccountOutputSchema>

export const AuthVerifyDeleteReauthInputSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('firebase_email'),
    email: z.string().email(),
    password: z.string().min(6),
  }),
  z.object({
    method: z.literal('tencent_phone'),
    phone: z.string().min(1),
    code: z.string().min(4),
  }),
])
export type AuthVerifyDeleteReauthInput = z.infer<typeof AuthVerifyDeleteReauthInputSchema>

export const AuthVerifyDeleteReauthOutputSchema = z.object({
  reauthToken: z.string().min(1),
})
export type AuthVerifyDeleteReauthOutput = z.infer<typeof AuthVerifyDeleteReauthOutputSchema>

export const AuthBindProviderInputSchema = z.object({
  provider: AuthProviderSchema,
  payload: z.record(z.unknown()).optional(),
})
export type AuthBindProviderInput = z.infer<typeof AuthBindProviderInputSchema>

export const AuthBindProviderOutputSchema = z.object({
  session: AuthSessionSchema,
})
export type AuthBindProviderOutput = z.infer<typeof AuthBindProviderOutputSchema>

export const AuthExchangeHubTokenInputSchema = z.object({
  hubBaseUrl: z.string().url().optional(),
})
export type AuthExchangeHubTokenInput = z.infer<typeof AuthExchangeHubTokenInputSchema>

export const AuthExchangeHubTokenOutputSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: TimestampSchema.nullable().optional(),
})
export type AuthExchangeHubTokenOutput = z.infer<typeof AuthExchangeHubTokenOutputSchema>

export const AuthGetFirebaseConfigOutputSchema = z.discriminatedUnion('configured', [
  z.object({ configured: z.literal(false) }),
  z.object({
    configured: z.literal(true),
    apiKey: z.string().min(1),
    authDomain: z.string().min(1),
    projectId: z.string().min(1),
    appId: z.string().min(1).optional(),
  }),
])
export type AuthGetFirebaseConfigOutput = z.infer<typeof AuthGetFirebaseConfigOutputSchema>

export const AuthSendSmsCodeInputSchema = z
  .object({
    account: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    region: AuthRegionSchema.default('cn'),
    intent: z.enum(['login', 'register', 'reset']).optional(),
  })
  .refine((value) => Boolean(value.account?.trim() || value.phone?.trim()), {
    message: 'account or phone is required',
  })
export type AuthSendSmsCodeInput = z.infer<typeof AuthSendSmsCodeInputSchema>

export const AuthOtpChannelSchema = z.enum(['phone', 'email'])
export type AuthOtpChannel = z.infer<typeof AuthOtpChannelSchema>

export const AuthSendSmsCodeOutputSchema = z.object({
  account: z.string().min(1),
  channel: AuthOtpChannelSchema,
  maskedAccount: z.string().min(1),
  phone: z.string().min(1).optional(),
  maskedPhone: z.string().min(1).optional(),
  retryAfterSeconds: z.number().int().nonnegative(),
  expiresInSeconds: z.number().int().positive().optional(),
  devHint: z.string().optional(),
})
export type AuthSendSmsCodeOutput = z.infer<typeof AuthSendSmsCodeOutputSchema>

export const AuthResetPasswordInputSchema = z.discriminatedUnion('region', [
  z.object({
    region: z.literal('cn'),
    account: z.string().min(1),
    code: z.string().min(4),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  }),
  z.object({
    region: z.literal('intl'),
    account: z.string().email(),
  }),
])
export type AuthResetPasswordInput = z.infer<typeof AuthResetPasswordInputSchema>

export const AuthResetPasswordOutputSchema = z.object({
  ok: z.literal(true),
  message: z.string().optional(),
})
export type AuthResetPasswordOutput = z.infer<typeof AuthResetPasswordOutputSchema>

export const AuthChangePasswordInputSchema = z.object({
  region: AuthRegionSchema.default('cn'),
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
})
export type AuthChangePasswordInput = z.infer<typeof AuthChangePasswordInputSchema>

export const AuthChangePasswordOutputSchema = z.object({
  ok: z.literal(true),
})
export type AuthChangePasswordOutput = z.infer<typeof AuthChangePasswordOutputSchema>

export const AuthGetTencentConfigOutputSchema = z.discriminatedUnion('configured', [
  z.object({ configured: z.literal(false) }),
  z.object({
    configured: z.literal(true),
    smsDevMode: z.boolean(),
    wechatDevMode: z.boolean(),
    wechatConfigured: z.boolean(),
    phoneConfigured: z.boolean(),
    douyinConfigured: z.boolean(),
    authingEnabled: z.boolean(),
  }),
])
export type AuthGetTencentConfigOutput = z.infer<typeof AuthGetTencentConfigOutputSchema>

export const AuthGetBuildProfileOutputSchema = z.object({
  buildRegion: z.enum(['cn', 'intl', 'global']),
  allowedRegions: z.array(AuthRegionSchema),
  defaultRegion: AuthRegionSchema,
  regionSwitchEnabled: z.boolean(),
  cnAuthEnabled: z.boolean(),
  intlAuthEnabled: z.boolean(),
})
export type AuthGetBuildProfileOutput = z.infer<typeof AuthGetBuildProfileOutputSchema>

export const AUTH_ERROR_CODES = {
  NOT_IMPLEMENTED: 'AUTH_NOT_IMPLEMENTED',
  NOT_CONFIGURED: 'AUTH_NOT_CONFIGURED',
  MERGE_REQUIRED: 'AUTH_MERGE_REQUIRED',
  REGISTRATION_REQUIRED: 'AUTH_REGISTRATION_REQUIRED',
  REAUTH_REQUIRED: 'AUTH_REAUTH_REQUIRED',
  NOT_LOGGED_IN: 'AUTH_NOT_LOGGED_IN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const

export const AuthMergeRequiredDetailsSchema = z.object({
  mergeToken: z.string().min(1),
  maskedPhone: z.string().min(1),
  wechatLabel: z.string().min(1),
})
export type AuthMergeRequiredDetails = z.infer<typeof AuthMergeRequiredDetailsSchema>

export function isRegisteredAuthSession(session: Pick<AuthSession, 'registrationStatus'>): boolean {
  return session.registrationStatus === 'registered'
}

export function canUseCommunityWrite(
  session?: Pick<AuthSession, 'registrationStatus' | 'isLoggedIn'> | null,
): boolean {
  return session?.registrationStatus === 'registered' && session.isLoggedIn === true
}

export function canUseGroupFeatures(
  session?: Pick<AuthSession, 'registrationStatus' | 'isLoggedIn'> | null,
): boolean {
  return session?.registrationStatus === 'registered' && session.isLoggedIn === true
}

export function canBrowseCommunityReadOnly(
  session?: Pick<AuthSession, 'registrationStatus'> | null,
): boolean {
  void session
  return true
}
