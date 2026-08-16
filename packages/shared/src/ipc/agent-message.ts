import { z } from 'zod'
import { IpcErrorSchema, PaginationSchema, TimestampSchema, UuidSchema } from './base.js'
import { ContentBlockSchema, ModelIdSchema, StreamDeltaSchema } from './agent-session.js'

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool'])
export const MessageStatusSchema = z.enum([
  'pending',
  'streaming',
  'completed',
  'aborted',
  'failed',
])

export const MessageSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  parentMessageId: UuidSchema.nullable(),
  role: MessageRoleSchema,
  modelId: ModelIdSchema.nullable(),
  status: MessageStatusSchema,
  contentBlocks: z.array(ContentBlockSchema),
  error: IpcErrorSchema.nullable(),
  tokenUsage: z
    .object({
      prompt: z.number().int(),
      completion: z.number().int(),
      total: z.number().int(),
    })
    .nullable(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Message = z.infer<typeof MessageSchema>

export const MessageListInputSchema = z.object({
  sessionId: UuidSchema,
  pagination: PaginationSchema.optional(),
})

export const MessageListOutputSchema = z.object({
  items: z.array(MessageSchema),
  nextCursor: z.string().optional(),
})

export const MessageSendInputSchema = z.object({
  sessionId: UuidSchema,
  contentBlocks: z.array(ContentBlockSchema).min(1),
  modelIds: z.array(ModelIdSchema).min(1).max(4).optional(),
  options: z
    .object({
      enableTools: z.boolean().default(false),
      stream: z.boolean().default(true),
      webSearchEnabled: z.boolean().optional(),
      webSearchProvider: z.enum(['duckduckgo', 'bing', 'google']).optional(),
      memoryEnabled: z.boolean().optional(),
      memoryRetentionDays: z.number().int().positive().optional(),
      kbEnabled: z.boolean().optional(),
      kbIds: z.array(UuidSchema).optional(),
      kbTopK: z.number().int().min(1).max(20).optional(),
      kbScoreThreshold: z.number().min(0).max(1).optional(),
      mcpServerIds: z.array(z.string()).optional(),
      documentOcrEnabled: z.boolean().optional(),
      isHeartbeat: z.boolean().optional(),
      isChannelMessage: z.boolean().optional(),
      taskId: UuidSchema.optional(),
    })
    .optional(),
})

export const MessageSendOutputSchema = z.object({
  userMessageId: UuidSchema,
  assistantMessageIds: z.array(UuidSchema),
  userContentBlocks: z.array(ContentBlockSchema).optional(),
})

const messageSendOptionsSchema = MessageSendInputSchema.shape.options

export const MessageRegenerateInputSchema = z.object({
  sessionId: UuidSchema,
  messageId: UuidSchema,
  modelIds: z.array(ModelIdSchema).min(1).max(4).optional(),
  options: messageSendOptionsSchema.optional(),
})

export const MessageRegenerateOutputSchema = MessageSendOutputSchema

export const MessageEditUserInputSchema = z.object({
  sessionId: UuidSchema,
  messageId: UuidSchema,
  contentBlocks: z.array(ContentBlockSchema).min(1),
  modelIds: z.array(ModelIdSchema).min(1).max(4).optional(),
  options: messageSendOptionsSchema.optional(),
})

export const MessageEditUserOutputSchema = MessageSendOutputSchema

export const TranslationLanguageSchema = z.enum(['zh', 'en'])
export type TranslationLanguage = z.infer<typeof TranslationLanguageSchema>

export const TranslationLanguagesSchema = z.tuple([
  TranslationLanguageSchema,
  TranslationLanguageSchema,
])

export const MessageTranslateInputSchema = z.object({
  text: z.string().min(1),
  modelId: ModelIdSchema,
  sourceLanguage: TranslationLanguageSchema,
  targetLanguage: TranslationLanguageSchema,
})

export const MessageTranslateOutputSchema = z.object({
  text: z.string(),
  sourceLanguage: TranslationLanguageSchema,
  targetLanguage: TranslationLanguageSchema,
})

export const MessageDiagnoseInputSchema = z.object({
  modelId: ModelIdSchema,
  errorSummary: z.string().min(1),
})

export const MessageDiagnoseOutputSchema = z.object({
  text: z.string(),
})

export const MessageAbortInputSchema = z.object({
  sessionId: UuidSchema,
  messageId: UuidSchema,
})

export const MessageAbortSessionInputSchema = z.object({
  sessionId: UuidSchema,
})

export const MessageAbortSessionOutputSchema = z.object({
  aborted: z.number().int().nonnegative(),
})

export const MessageDeleteInputSchema = z.object({
  sessionId: UuidSchema,
  messageId: UuidSchema,
})

export const MessageDeleteOutputSchema = z.object({
  deleted: z.boolean(),
})

export const MessageStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message.delta'),
    sessionId: UuidSchema,
    messageId: UuidSchema,
    modelId: ModelIdSchema.optional(),
    delta: StreamDeltaSchema,
    timestamp: TimestampSchema,
  }),
  z.object({
    type: z.literal('message.done'),
    sessionId: UuidSchema,
    messageId: UuidSchema,
    tokenUsage: MessageSchema.shape.tokenUsage,
    contentBlocks: z.array(ContentBlockSchema).optional(),
    timestamp: TimestampSchema,
  }),
  z.object({
    type: z.literal('message.error'),
    sessionId: UuidSchema,
    messageId: UuidSchema.optional(),
    error: IpcErrorSchema,
    timestamp: TimestampSchema,
  }),
])

export type MessageStreamEvent = z.infer<typeof MessageStreamEventSchema>
