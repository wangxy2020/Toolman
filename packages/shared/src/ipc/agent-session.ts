import { z } from 'zod'
import { PaginationSchema, TimestampSchema, UuidSchema } from './base.js'
import { KnowledgeCitationSchema } from './knowledge-ingest.js'


/** providerId:modelName — model 名可含冒号，如 Ollama 的 gemma4:26b */
export const ModelIdSchema = z
  .string()
  .refine((id) => {
    const sep = id.indexOf(':')
    return sep > 0 && sep < id.length - 1
  }, { message: 'Invalid modelId format, expected providerId:modelName' })

export const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('thinking'),
    text: z.string(),
    durationSeconds: z.number().int().nonnegative().optional(),
    /** Main-process wall clock when the thinking phase started (for live UI timing). */
    startedAtMs: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('tool'),
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    arguments: z.string().optional(),
    result: z.string().optional(),
    status: z.enum(['running', 'done', 'failed']),
  }),
  z.object({
    type: z.literal('image'),
    blobHash: z.string().default(''),
    mimeType: z.string(),
    alt: z.string().optional(),
    path: z.string().optional(),
  }),
  z.object({
    type: z.literal('file'),
    name: z.string(),
    path: z.string(),
    content: z.string().default(''),
    blobHash: z.string().default(''),
    mimeType: z.string().optional(),
    truncated: z.boolean().optional(),
    delivery: z.enum(['text', 'vision', 'docx_tool', 'excel_tool']).optional(),
    visionPages: z
      .array(
        z.object({
          blobHash: z.string(),
          mimeType: z.string(),
          pageNumber: z.number().int().positive(),
        }),
      )
      .optional(),
  }),
  z.object({
    type: z.literal('kb_sources'),
    sources: z.array(KnowledgeCitationSchema),
  }),
  z.object({
    type: z.literal('local_file_links'),
    title: z.string().optional(),
    paths: z.array(z.string().min(1)),
  }),
  z.object({
    type: z.literal('docx_review_summary'),
    fileName: z.string(),
    workingPath: z.string(),
    issuesFound: z.number().int().nonnegative(),
    commentsRequested: z.number().int().nonnegative(),
    commentsApplied: z.number().int().nonnegative(),
    commentsFailed: z.number().int().nonnegative(),
    replacementsRequested: z.number().int().nonnegative(),
    replacementsApplied: z.number().int().nonnegative(),
    replacementsFailed: z.number().int().nonnegative(),
    paragraphEditsRequested: z.number().int().nonnegative(),
    paragraphEditsApplied: z.number().int().nonnegative(),
    paragraphEditsFailed: z.number().int().nonnegative(),
    conversionMethod: z
      .enum(['office-oxide', 'libreoffice', 'microsoft-word', 'plaintext'])
      .optional(),
    errors: z.array(z.string()).optional(),
    parseWarnings: z.array(z.string()).optional(),
  }),
])

export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const StreamDeltaSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
    /** When true, replace the last text block instead of appending. */
    replace: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('thinking'),
    text: z.string(),
    durationSeconds: z.number().int().nonnegative().optional(),
    /** Main-process wall clock when the thinking phase started (for live UI timing). */
    startedAtMs: z.number().int().nonnegative().optional(),
    replace: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('tool'),
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    arguments: z.string().optional(),
    result: z.string().optional(),
    status: z.enum(['running', 'done', 'failed']),
  }),
  z.object({
    type: z.literal('kb_sources'),
    sources: z.array(KnowledgeCitationSchema),
  }),
])

export type StreamDelta = z.infer<typeof StreamDeltaSchema>

export const SessionTypeSchema = z.enum(['chat', 'meeting', 'multi_model'])

export const SessionSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  assistantId: UuidSchema.nullable(),
  title: z.string(),
  type: SessionTypeSchema,
  parentSessionId: UuidSchema.nullable(),
  forkMessageId: UuidSchema.nullable(),
  metadata: z.record(z.unknown()),
  messageCount: z.number().int(),
  lastMessageAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Session = z.infer<typeof SessionSchema>

export const SessionCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  assistantId: UuidSchema.optional(),
  title: z.string().max(256).optional(),
  type: SessionTypeSchema.default('chat'),
  metadata: z.record(z.unknown()).optional(),
})

export const SessionListInputSchema = z.object({
  workspaceId: UuidSchema,
  type: SessionTypeSchema.optional(),
  assistantId: UuidSchema.optional(),
  query: z.string().optional(),
  pagination: PaginationSchema.optional(),
})

export const SessionListOutputSchema = z.object({
  items: z.array(SessionSchema),
  nextCursor: z.string().optional(),
})

export const SessionGetInputSchema = z.object({ id: UuidSchema })

export const SessionUpdateInputSchema = z.object({
  id: UuidSchema,
  title: z.string().max(256).optional(),
  assistantId: UuidSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const SessionDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const SessionForkInputSchema = z.object({
  sessionId: UuidSchema,
  forkMessageId: UuidSchema,
  title: z.string().max(256).optional(),
})

export const SessionForkOutputSchema = z.object({
  session: SessionSchema,
})

export const SessionClearMessagesInputSchema = z.object({
  sessionId: UuidSchema,
})

export const SessionClearMessagesOutputSchema = z.object({
  cleared: z.number().int().nonnegative(),
})
