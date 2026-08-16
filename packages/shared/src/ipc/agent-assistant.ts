import { z } from 'zod'
import { UuidSchema } from './base.js'
import { TranslationLanguagesSchema } from './agent-message.js'
import { ModelIdSchema } from './agent-session.js'

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
    longTaskMode: z.boolean().optional(),
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
    plannerModelId: z.string().min(1).optional(),
    translationLanguages: TranslationLanguagesSchema.optional(),
    /** When true, auto-speak final answer text via the client TTS pipeline. Default off. */
    autoSpeak: z.boolean().optional(),
    /** TTS engine: Edge neural (default) or system Web Speech. */
    ttsEngine: z.enum(['edge', 'web-speech']).optional(),
    /** Edge neural voice short name, e.g. zh-CN-XiaoxiaoNeural. */
    ttsVoice: z.string().min(1).optional(),
    /** Assistant classroom teaching mode (Socratic / open). */
    teachingMode: z.enum(['socratic', 'open', 'off']).optional(),
    /** Preset id from assistant classroom (e.g. socratic-tutor). */
    assistantLibPresetId: z.string().min(1).optional(),
    /** User removed the seeded Toolman usage-guide course; do not recreate it. */
    assistantLibGuideDismissed: z.boolean().optional(),
    /** Roleplay companion id (detective / auditor / …). */
    roleplayId: z.string().min(1).optional(),
    /** When true (default for socratic), run post-reply answer-leak referee. */
    refereeEnabled: z.boolean().optional(),
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

export const AssistantParametersSchema = AssistantSchema.shape.parameters

export const AssistantListInputSchema = z.object({
  workspaceId: UuidSchema,
  pinnedOnly: z.boolean().default(false),
})

export const AssistantListOutputSchema = z.array(AssistantSchema)

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
