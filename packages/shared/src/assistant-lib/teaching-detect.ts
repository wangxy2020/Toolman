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
      ...(patch.courseName?.trim() ? { courseName: patch.courseName.trim() } : {}),
      ...(patch.isDefaultClassroom ? { isDefaultClassroom: true as const } : {}),
      ...(patch.textbookLocalPath?.trim()
        ? { textbookLocalPath: patch.textbookLocalPath.trim() }
        : {}),
      ...(typeof patch.autoSpeak === 'boolean' ? { autoSpeak: patch.autoSpeak } : {}),
      ...(patch.ttsEngine ? { ttsEngine: patch.ttsEngine } : {}),
      ...(patch.ttsVoice?.trim() ? { ttsVoice: patch.ttsVoice.trim() } : {}),
    },
    socraticState: metadata?.socraticState ?? EMPTY_SOCRATIC_STATE,
  }
}

/** Resolve classroom TTS; assistant-lib defaults autoSpeak to on. */
export function resolveAssistantLibSessionTts(
  metadata: Record<string, unknown> | undefined | null,
): {
  autoSpeak: boolean
  ttsEngine: 'edge' | 'web-speech'
  ttsVoice: string | undefined
} | null {
  const meta = parseAssistantLibSessionMeta(metadata)
  if (!meta) return null
  return {
    autoSpeak: meta.autoSpeak ?? true,
    ttsEngine: meta.ttsEngine === 'web-speech' ? 'web-speech' : 'edge',
    ttsVoice: meta.ttsVoice,
  }
}

export function isAssistantLibDefaultClassroomSession(
  metadata: Record<string, unknown> | undefined | null,
): boolean {
  return parseAssistantLibSessionMeta(metadata)?.isDefaultClassroom === true
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
