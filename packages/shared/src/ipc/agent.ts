import { z } from 'zod'
import { PaginationSchema, TimestampSchema, UuidSchema, IpcErrorSchema } from './base.js'
import { KnowledgeCitationSchema } from './knowledge.js'

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
      .enum(['libreoffice', 'microsoft-word', 'plaintext'])
      .optional(),
    errors: z.array(z.string()).optional(),
    parseWarnings: z.array(z.string()).optional(),
  }),
])

export type ContentBlock = z.infer<typeof ContentBlockSchema>

export const StreamDeltaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('thinking'),
    text: z.string(),
    durationSeconds: z.number().int().nonnegative().optional(),
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

export const AssistantSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string(),
  description: z.string().optional(),
  systemPrompt: z.string(),
  modelId: ModelIdSchema,
  parameters: z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional(),
    workingDirectory: z.string().optional(),
    autonomousMode: z.boolean().optional(),
    heartbeatEnabled: z.boolean().optional(),
    heartbeatIntervalMinutes: z.number().int().min(1).optional(),
    permissionMode: z.enum(['normal', 'plan', 'auto-edit', 'full-auto']).optional(),
    toolStates: z.record(z.string(), z.boolean()).optional(),
    mcpServerIds: z.array(z.string()).optional(),
    skillIds: z.array(z.string()).optional(),
    kbIds: z.array(UuidSchema).optional(),
    kbTopK: z.number().int().min(1).max(20).optional(),
    kbScoreThreshold: z.number().min(0).max(1).optional(),
    kbSettings: z
      .record(
        z.object({
          topK: z.number().int().min(1).max(20).optional(),
          scoreThreshold: z.number().min(0).max(1).optional(),
        }),
      )
      .optional(),
    sessionRoundLimit: z.number().int().min(1).optional(),
    environmentVariables: z.string().optional(),
    translationLanguages: TranslationLanguagesSchema.optional(),
    p2pGroupProxy: z
      .object({
        p2pWorkspaceId: UuidSchema,
        resourceId: z.string().min(1),
        sourceAssistantId: z.string().min(1),
        groupName: z.string(),
        sharedAgentName: z.string(),
        referencedModelId: z.string().min(1).optional(),
      })
      .optional(),
    p2pGroupSharedMirror: z
      .object({
        p2pWorkspaceId: UuidSchema,
        resourceId: z.string().min(1),
      })
      .optional(),
  }),
  isBuiltin: z.boolean(),
  isPinned: z.boolean(),
})

export type Assistant = z.infer<typeof AssistantSchema>

export const AssistantListInputSchema = z.object({
  workspaceId: UuidSchema,
  pinnedOnly: z.boolean().default(false),
})

export const AssistantCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  name: z.string().min(1).max(64),
  description: z.string().max(256).optional(),
  systemPrompt: z.string().default('你是一个有帮助的 AI 助手。'),
  modelId: ModelIdSchema,
  parameters: AssistantSchema.shape.parameters.optional(),
  isPinned: z.boolean().default(false),
})

export const AssistantUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(256).nullable().optional(),
  systemPrompt: z.string().optional(),
  modelId: ModelIdSchema.optional(),
  parameters: AssistantSchema.shape.parameters.partial().optional(),
  isPinned: z.boolean().optional(),
})

export const AssistantDeleteInputSchema = z.object({
  id: UuidSchema,
})

export const AssistantDuplicateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(64).optional(),
})

export const AssistantDeleteOutputSchema = z.object({
  deleted: z.boolean(),
  deletedSessionIds: z.array(UuidSchema),
})

export const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'ollama',
  'openai_compatible',
  'azure_openai',
])

export const ProviderModelTypesSchema = z.object({
  vision: z.boolean().optional(),
  web: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  tools: z.boolean().optional(),
  rerank: z.boolean().optional(),
  embedding: z.boolean().optional(),
})

export const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string().optional(),
  types: ProviderModelTypesSchema.optional(),
  incrementalOutput: z.boolean().optional(),
  currency: z.enum(['USD', 'CNY']).optional(),
  inputPrice: z.number().optional(),
})

export type ProviderModel = z.infer<typeof ProviderModelSchema>

export const ProviderSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  name: z.string(),
  type: ProviderTypeSchema,
  baseUrl: z.string().nullable(),
  isEnabled: z.boolean(),
  presetId: z.string().nullable().optional(),
  models: z.array(ProviderModelSchema),
  hasApiKey: z.boolean(),
  apiKeyRotate: z.boolean().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Provider = z.infer<typeof ProviderSchema>
export type ProviderType = z.infer<typeof ProviderTypeSchema>

export const ProviderListInputSchema = z.object({
  workspaceId: UuidSchema,
  enabledOnly: z.boolean().default(false),
})

export const ProviderCreateInputSchema = z.object({
  workspaceId: UuidSchema,
  name: z.string().min(1),
  type: ProviderTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  presetId: z.string().optional(),
})

export const ProviderUpdateInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).optional(),
  type: ProviderTypeSchema.optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().optional(),
  isEnabled: z.boolean().optional(),
  presetId: z.string().optional(),
  apiKeyRotate: z.boolean().optional(),
  models: z.array(ProviderModelSchema).optional(),
})

export const ProviderDeleteInputSchema = z.object({ id: UuidSchema })
export const ProviderDeleteOutputSchema = z.object({ deleted: z.boolean() })

export const ProviderTestInputSchema = z.object({
  id: UuidSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().url().nullable().optional(),
})
export const ProviderTestOutputSchema = z.object({
  success: z.boolean(),
  latencyMs: z.number(),
  error: z.string().optional(),
})

export const ProviderFetchModelsInputSchema = z.object({
  id: UuidSchema,
  persist: z.boolean().default(true),
})
export const ProviderFetchModelsOutputSchema = z.object({
  models: z.array(ProviderModelSchema),
})

export const ToolApprovalRequestSchema = z.object({
  requestId: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.string(),
})

export type ToolApprovalRequest = z.infer<typeof ToolApprovalRequestSchema>

export const ToolApprovalRespondInputSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean(),
})

export const ToolApprovalRespondOutputSchema = z.object({
  responded: z.boolean(),
})
