import {
  isAssistantLibGuideCourseSession,
  looksLikeAssistantLibDefaultClassroom,
  looksLikeAssistantLibGuideCourse,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  parseSocraticState,
  resolveOngoingClassroomFocus,
  type Session,
} from '@toolman/shared'

export function buildShareSummary(
  title: string,
  metadata: Record<string, unknown> | undefined,
): string {
  const state = parseSocraticState(metadata)
  return [
    `# ${title}`,
    '',
    `已确认：${state.confirmedClaims.join('；') || '—'}`,
    `待澄清：${state.openAssumptions.join('；') || '—'}`,
    `已掌握：${state.mastered.join('；') || '—'}`,
  ].join('\n')
}

export function resolveActiveLearningSession(
  learningSessions: Session[],
  activeSessionId: string | null,
  activeAssistantId: string | null,
  sharedAssistantId: string | null,
): Session | null {
  if (activeSessionId && sharedAssistantId && activeAssistantId === sharedAssistantId) {
    const current = learningSessions.find((item) => item.id === activeSessionId)
    if (current && !looksLikeAssistantLibDefaultClassroom(current)) return current
  }
  const ongoingId = resolveOngoingClassroomFocus(
    learningSessions
      .filter((item) => !looksLikeAssistantLibDefaultClassroom(item))
      .map((item) => {
        const meta = parseAssistantLibSessionMeta(item.metadata)
        return {
          id: item.id,
          studyRecords: meta?.studyRecords,
          syllabus: parseCourseSyllabus(meta?.syllabus),
        }
      }),
  )?.courseId
  return (
    learningSessions.find((item) => item.id === ongoingId) ??
    learningSessions.find((item) => isAssistantLibGuideCourseSession(item.metadata)) ??
    learningSessions.find((item) => !looksLikeAssistantLibDefaultClassroom(item)) ??
    null
  )
}

export function resolveAssistantLibSecondaryLabel(
  session: Session | null,
  labels: { records: string; defaultCourse: string; guideCourse: string },
  showRecords: boolean,
): string {
  if (showRecords) return labels.records
  if (!session) return labels.defaultCourse
  if (looksLikeAssistantLibDefaultClassroom(session)) return labels.defaultCourse
  if (looksLikeAssistantLibGuideCourse(session)) return labels.guideCourse
  return (
    parseAssistantLibSessionMeta(session.metadata)?.courseName?.trim() || session.title
  )
}
