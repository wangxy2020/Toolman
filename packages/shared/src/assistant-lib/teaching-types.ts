import { z } from 'zod'
import { VoiceTtsEngineSchema } from '../ipc/voice.js'

/** Assistant teaching mode — gates Socratic RAG / referee. */
export const TeachingModeSchema = z.enum(['socratic', 'open', 'off'])
export type TeachingMode = z.infer<typeof TeachingModeSchema>

export const ASSISTANT_LIB_SESSION_METADATA_KEY = 'toolmanAssistantLib'

export const AssistantLibSessionMetaSchema = z.object({
  enabled: z.literal(true),
  presetId: z.string().min(1),
  roleplayId: z.string().optional(),
  learningLabel: z.string().default('学习'),
  /** Per-course teaching flags (shared agent hosts many course topics). */
  teachingMode: TeachingModeSchema.optional(),
  refereeEnabled: z.boolean().optional(),
  kbIds: z.array(z.string().uuid()).optional(),
  customSystemPrompt: z.string().optional(),
  courseName: z.string().optional(),
  /** Built-in default classroom topic under the shared「课堂」agent. */
  isDefaultClassroom: z.boolean().optional(),
  /** Local textbook folder when user binds a disk path instead of a KB. */
  textbookLocalPath: z.string().min(1).optional(),
  /** Per-classroom TTS; default on when omitted. */
  autoSpeak: z.boolean().optional(),
  ttsEngine: VoiceTtsEngineSchema.optional(),
  ttsVoice: z.string().min(1).optional(),
})

export type AssistantLibSessionMeta = z.infer<typeof AssistantLibSessionMetaSchema>

export const SocraticStateSchema = z.object({
  topic: z.string().optional(),
  mastered: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  stuckPoints: z.array(z.string()).default([]),
  confirmedClaims: z.array(z.string()).default([]),
  openAssumptions: z.array(z.string()).default([]),
  pathIndex: z.number().int().min(0).optional(),
  pathNodes: z.array(z.string()).default([]),
  updatedAt: z.number().int().optional(),
})

export type SocraticState = z.infer<typeof SocraticStateSchema>

export const EMPTY_SOCRATIC_STATE: SocraticState = {
  mastered: [],
  misconceptions: [],
  stuckPoints: [],
  confirmedClaims: [],
  openAssumptions: [],
  pathNodes: [],
}

export type AssistantLibPresetId =
  | 'socratic-tutor'
  | 'detective'
  | 'engineering-auditor'
  | 'blank-learner'

export type AssistantLibPresetDef = {
  id: AssistantLibPresetId
  name: string
  roleplayId: string
  teachingMode: TeachingMode
  refereeEnabled: boolean
  description: string
  systemPrompt: string
  /** Placeholder template — not seeded as a full course by default. */
  placeholder?: boolean
  /** Hidden from create-course picker (kept for legacy sessions). */
  hidden?: boolean
}
