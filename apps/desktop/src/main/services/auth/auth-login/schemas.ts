import { z } from 'zod'
import type { AuthProvider } from '@toolman/shared'

export const FIREBASE_PROVIDERS = new Set<AuthProvider>([
  'firebase_email',
  'firebase_google',
  'firebase_apple',
])

export const CN_PROVIDERS = new Set<AuthProvider>(['tencent_phone', 'tencent_wechat', 'tencent_douyin'])

export const EmailLoginPayloadSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  intent: z.enum(['login', 'register']).optional(),
})

export const IdTokenLoginPayloadSchema = z.object({
  idToken: z.string().min(1),
})

export const OtpLoginPayloadSchema = z.object({
  account: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  code: z.string().min(4),
  intent: z.enum(['login', 'register']).optional(),
})

export const CnEmailPasswordLoginPayloadSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(6),
  intent: z.literal('login').optional(),
})

export const CnRegisterPayloadSchema = z.object({
  account: z.string().min(1),
  code: z.string().min(4),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  intent: z.literal('register'),
})

export const WechatMergePayloadSchema = z.object({
  mergeToken: z.string().min(1),
  phone: z.string().min(1),
  code: z.string().min(4),
})
