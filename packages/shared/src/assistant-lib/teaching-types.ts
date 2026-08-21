import { z } from 'zod'
import { VoiceTtsEngineSchema } from '../ipc/voice.js'

/** Assistant teaching mode — gates Socratic RAG / referee. */
export const TeachingModeSchema = z.enum(['socratic', 'open', 'off'])
export type TeachingMode = z.infer<typeof TeachingModeSchema>

export const CourseSyllabusChapterStatusSchema = z.enum([
  'pending',
  'generating',
  'ready',
  'in_progress',
  'passed',
])
export type CourseSyllabusChapterStatus = z.infer<typeof CourseSyllabusChapterStatusSchema>

export const CourseSyllabusChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  hours: z.number().positive().optional(),
  lessonPlan: z.string().optional(),
  assessmentQuestions: z.array(z.string()).default([]),
  status: CourseSyllabusChapterStatusSchema.default('pending'),
})
export type CourseSyllabusChapter = z.infer<typeof CourseSyllabusChapterSchema>

export const CourseSyllabusSchema = z.object({
  generation: z.enum(['idle', 'generating', 'ready', 'error']).default('idle'),
  generationError: z.string().optional(),
  generatedCount: z.number().int().min(0).default(0),
  totalHours: z.number().optional(),
  chapters: z.array(CourseSyllabusChapterSchema).default([]),
  updatedAt: z.number().int().optional(),
})
export type CourseSyllabus = z.infer<typeof CourseSyllabusSchema>

export const ClassroomStudyRecordSchema = z.object({
  id: z.string().min(1),
  startedAt: z.number().int(),
  endedAt: z.number().int().optional(),
  chapterId: z.string().optional(),
  chapterTitle: z.string().optional(),
  summary: z.string().optional(),
  mastered: z.array(z.string()).default([]),
  stuckPoints: z.array(z.string()).default([]),
  qaCount: z.number().int().min(0).default(0),
})
export type ClassroomStudyRecord = z.infer<typeof ClassroomStudyRecordSchema>

export const EMPTY_COURSE_SYLLABUS: CourseSyllabus = {
  generation: 'idle',
  generatedCount: 0,
  chapters: [],
}

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
  /** Legacy markdown override; structured syllabus is preferred. */
  lessonPlan: z.string().optional(),
  syllabus: CourseSyllabusSchema.optional(),
  courseName: z.string().optional(),
  /** Built-in default classroom topic under the shared「课堂」agent. */
  isDefaultClassroom: z.boolean().optional(),
  /** Built-in Toolman usage-guide course; removable from course settings. */
  isGuideClassroom: z.boolean().optional(),
  /** Local textbook folder when user binds a disk path instead of a KB. */
  textbookLocalPath: z.string().min(1).optional(),
  /** Per-classroom TTS; default on when omitted. */
  autoSpeak: z.boolean().optional(),
  ttsEngine: VoiceTtsEngineSchema.optional(),
  ttsVoice: z.string().min(1).optional(),
  /** Chat model from program settings (providerId:modelName). Empty = workspace default. */
  modelId: z.string().min(1).optional(),
  /** One entry per 上课; scoped to this course session. */
  studyRecords: z.array(ClassroomStudyRecordSchema).optional(),
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
  /** True when the current syllabus chapter's assessment is passed this turn. */
  chapterPassed: z.boolean().optional(),
  currentChapterId: z.string().optional(),
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
  | 'toolman-guide'

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
