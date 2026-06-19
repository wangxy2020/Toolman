import { z } from 'zod'
import { CHANNEL_PLATFORM_IDS } from '../channel-constants.js'

export const ChannelPlatformIdSchema = z.enum(CHANNEL_PLATFORM_IDS)

export const ChannelRuntimeStatusSchema = z.enum([
  'stopped',
  'connecting',
  'connected',
  'error',
  'unsupported',
])

export type ChannelRuntimeStatus = z.infer<typeof ChannelRuntimeStatusSchema>

export const ImChannelConfigSchema = z.object({
  platform: ChannelPlatformIdSchema,
  enabled: z.boolean(),
  name: z.string().min(1).max(128),
  assistantId: z.string(),
  appId: z.string(),
  appSecret: z.string(),
  encryptKey: z.string(),
  verificationToken: z.string(),
  domain: z.string(),
  allowedChatIds: z.string(),
})

export type ImChannelConfig = z.infer<typeof ImChannelConfigSchema>

export const ImChannelConfigPublicSchema = ImChannelConfigSchema.extend({
  hasAppSecret: z.boolean(),
  hasEncryptKey: z.boolean(),
}).omit({ appSecret: true, encryptKey: true })

export type ImChannelConfigPublic = z.infer<typeof ImChannelConfigPublicSchema>

export const ImChannelListOutputSchema = z.object({
  webhookPort: z.number().int().positive(),
  webhookBaseUrl: z.string(),
  items: z.array(ImChannelConfigPublicSchema),
})

export const ImChannelUpsertInputSchema = ImChannelConfigSchema.partial({
  appSecret: true,
  encryptKey: true,
}).extend({
  platform: ChannelPlatformIdSchema,
})

export const ImChannelTestInputSchema = z.object({
  platform: ChannelPlatformIdSchema,
})

export const ImChannelTestOutputSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})

export const ImChannelStatusItemSchema = z.object({
  platform: ChannelPlatformIdSchema,
  status: ChannelRuntimeStatusSchema,
  message: z.string().optional(),
  lastEventAt: z.number().int().nonnegative().optional(),
})

export const ImChannelStatusListOutputSchema = z.object({
  items: z.array(ImChannelStatusItemSchema),
})

export const ImChannelWebhookInfoOutputSchema = z.object({
  port: z.number().int().positive(),
  baseUrl: z.string(),
  paths: z.record(z.string()),
})
