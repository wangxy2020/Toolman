import {
  ASSISTANT_LIB_SESSION_METADATA_KEY,
  AssistantLibSessionMetaSchema,
  EMPTY_SOCRATIC_STATE,
  SocraticStateSchema,
  type AssistantLibSessionMeta,
  type SocraticState,
  type TeachingMode,
} from './teaching-types.js'

export function parseTeachingMode(value: unknown): TeachingMode | null {
  if (value === 'socratic' || value === 'open' || value === 'off') return value
  return null
}

export function isSocraticTeachingMode(mode: unknown): boolean {
  return parseTeachingMode(mode) === 'socratic'
}

export function isTeachingAssistantParameters(parameters: {
  teachingMode?: unknown
  assistantLibPresetId?: unknown
}): boolean {
  const mode = parseTeachingMode(parameters.teachingMode)
  if (mode === 'socratic' || mode === 'open') return true
  return typeof parameters.assistantLibPresetId === 'string' && parameters.assistantLibPresetId.length > 0
}

export function parseAssistantLibSessionMeta(
  metadata: Record<string, unknown> | undefined | null,
): AssistantLibSessionMeta | null {
  if (!metadata) return null
  const raw = metadata[ASSISTANT_LIB_SESSION_METADATA_KEY]
  const parsed = AssistantLibSessionMetaSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function isAssistantLibSession(metadata: Record<string, unknown> | undefined | null): boolean {
  return Boolean(parseAssistantLibSessionMeta(metadata))
}

export function assistantLibSessionMetadataPatch(
  metadata: Record<string, unknown> | undefined | null,
  patch: Omit<AssistantLibSessionMeta, 'enabled' | 'learningLabel'> & {
    learningLabel?: string
  },
): Record<string, unknown> {
  const previous = parseAssistantLibSessionMeta(metadata)
  const nextLessonPlan =
    patch.lessonPlan !== undefined ? patch.lessonPlan.trim() : (previous?.lessonPlan ?? '')
  const nextSyllabus = patch.syllabus !== undefined ? patch.syllabus : previous?.syllabus
  const nextStudyRecords =
    patch.studyRecords !== undefined ? patch.studyRecords : (previous?.studyRecords ?? [])
  const nextModelId =
    patch.modelId !== undefined ? patch.modelId.trim() : (previous?.modelId?.trim() ?? '')
  return {
    ...(metadata ?? {}),
    [ASSISTANT_LIB_SESSION_METADATA_KEY]: {
      enabled: true as const,
      learningLabel: patch.learningLabel ?? '学习',
      presetId: patch.presetId,
      ...(patch.roleplayId ? { roleplayId: patch.roleplayId } : {}),
      ...(patch.teachingMode ? { teachingMode: patch.teachingMode } : {}),
      ...(typeof patch.refereeEnabled === 'boolean'
        ? { refereeEnabled: patch.refereeEnabled }
        : {}),
      ...(patch.kbIds && patch.kbIds.length > 0 ? { kbIds: patch.kbIds } : {}),
      ...(patch.customSystemPrompt?.trim()
        ? { customSystemPrompt: patch.customSystemPrompt.trim() }
        : {}),
      ...(nextLessonPlan ? { lessonPlan: nextLessonPlan } : {}),
      ...(nextSyllabus ? { syllabus: nextSyllabus } : {}),
      ...(nextStudyRecords.length > 0 ? { studyRecords: nextStudyRecords } : {}),
      ...(patch.courseName?.trim() ? { courseName: patch.courseName.trim() } : {}),
      ...(previous?.isDefaultClassroom || patch.isDefaultClassroom
        ? { isDefaultClassroom: true as const }
        : {}),
      ...(previous?.isGuideClassroom || patch.isGuideClassroom
        ? { isGuideClassroom: true as const }
        : {}),
      ...(patch.textbookLocalPath?.trim()
        ? { textbookLocalPath: patch.textbookLocalPath.trim() }
        : {}),
      ...(typeof patch.autoSpeak === 'boolean'
        ? { autoSpeak: patch.autoSpeak }
        : typeof previous?.autoSpeak === 'boolean'
          ? { autoSpeak: previous.autoSpeak }
          : {}),
      ...(patch.ttsEngine
        ? { ttsEngine: patch.ttsEngine }
        : previous?.ttsEngine
          ? { ttsEngine: previous.ttsEngine }
          : {}),
      ...(patch.ttsVoice?.trim()
        ? { ttsVoice: patch.ttsVoice.trim() }
        : previous?.ttsVoice?.trim()
          ? { ttsVoice: previous.ttsVoice.trim() }
          : {}),
      ...(nextModelId ? { modelId: nextModelId } : {}),
    },
    socraticState: metadata?.socraticState ?? EMPTY_SOCRATIC_STATE,
  }
}

export type ResolvedChatTts = {
  autoSpeak: boolean
  ttsEngine: 'edge' | 'web-speech'
  ttsVoice: string | undefined
}

function resolveTtsFromAssistantLibRaw(
  raw: Record<string, unknown>,
): ResolvedChatTts | null {
  // Course topics always carry enabled + presetId; keep TTS readable even when
  // unrelated syllabus fields fail the strict session meta schema.
  if (raw.enabled !== true) return null
  if (typeof raw.presetId !== 'string' || !raw.presetId.trim()) return null
  return {
    autoSpeak: typeof raw.autoSpeak === 'boolean' ? raw.autoSpeak : true,
    ttsEngine: raw.ttsEngine === 'web-speech' ? 'web-speech' : 'edge',
    ttsVoice:
      typeof raw.ttsVoice === 'string' && raw.ttsVoice.trim()
        ? raw.ttsVoice.trim()
        : undefined,
  }
}

/** Resolve classroom TTS; assistant-lib defaults autoSpeak to on. */
function resolveAssistantLibSessionTts(
  metadata: Record<string, unknown> | undefined | null,
): ResolvedChatTts | null {
  const meta = parseAssistantLibSessionMeta(metadata)
  if (meta) {
    return {
      autoSpeak: meta.autoSpeak ?? true,
      ttsEngine: meta.ttsEngine === 'web-speech' ? 'web-speech' : 'edge',
      ttsVoice: meta.ttsVoice,
    }
  }
  if (!metadata) return null
  const raw = metadata[ASSISTANT_LIB_SESSION_METADATA_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return resolveTtsFromAssistantLibRaw(raw as Record<string, unknown>)
}

/**
 * Effective chat TTS: course session settings win over the shared 课堂 agent.
 * Only fall back to assistant parameters when the active topic is not a course.
 */
export function resolveEffectiveChatTts(options: {
  sessionMetadata?: Record<string, unknown> | null
  assistantAutoSpeak?: boolean | null
  assistantTtsEngine?: 'edge' | 'web-speech' | null
  assistantTtsVoice?: string | null
}): ResolvedChatTts {
  const course = resolveAssistantLibSessionTts(options.sessionMetadata)
  if (course) return course
  return {
    autoSpeak: Boolean(options.assistantAutoSpeak),
    ttsEngine: options.assistantTtsEngine === 'web-speech' ? 'web-speech' : 'edge',
    ttsVoice: options.assistantTtsVoice?.trim() || undefined,
  }
}

export function isAssistantLibDefaultClassroomSession(
  metadata: Record<string, unknown> | undefined | null,
): boolean {
  return parseAssistantLibSessionMeta(metadata)?.isDefaultClassroom === true
}

export function isAssistantLibGuideCourseSession(
  metadata: Record<string, unknown> | undefined | null,
): boolean {
  return parseAssistantLibSessionMeta(metadata)?.isGuideClassroom === true
}

export function parseSocraticState(metadata: Record<string, unknown> | undefined | null): SocraticState {
  const parsed = SocraticStateSchema.safeParse(metadata?.socraticState)
  return parsed.success ? parsed.data : { ...EMPTY_SOCRATIC_STATE }
}

export function mergeSocraticState(base: SocraticState, patch: Partial<SocraticState>): SocraticState {
  return {
    topic: patch.topic ?? base.topic,
    mastered: patch.mastered ?? base.mastered,
    misconceptions: patch.misconceptions ?? base.misconceptions,
    stuckPoints: patch.stuckPoints ?? base.stuckPoints,
    confirmedClaims: patch.confirmedClaims ?? base.confirmedClaims,
    openAssumptions: patch.openAssumptions ?? base.openAssumptions,
    pathIndex: patch.pathIndex ?? base.pathIndex,
    pathNodes: patch.pathNodes ?? base.pathNodes,
    chapterPassed: patch.chapterPassed ?? base.chapterPassed,
    currentChapterId: patch.currentChapterId ?? base.currentChapterId,
    updatedAt: Date.now(),
  }
}

/** Heuristic: draft looks like it dumped a direct answer (for Referee). */
export function looksLikeSocraticAnswerLeak(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const leakPatterns = [
    /正确答案[是为：:]/,
    /标准答案[是为：:]/,
    /答案[是为：:]\s*\S{8,}/,
    /结论[是为：:]\s*\S{8,}/,
    /你应该这样[做写]/,
    /完整步骤如下/,
    /综上所述[，,].{20,}/,
    /the correct answer is/i,
    /here's the full solution/i,
  ]
  if (leakPatterns.some((re) => re.test(trimmed))) return true
  const questionMarks = (trimmed.match(/[？?]/g) ?? []).length
  const length = trimmed.length
  // Long monologue with almost no questions → likely lecturing
  return length > 420 && questionMarks === 0
}
