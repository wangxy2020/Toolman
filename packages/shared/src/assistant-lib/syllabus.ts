import {
  CourseSyllabusSchema,
  EMPTY_COURSE_SYLLABUS,
  EMPTY_SOCRATIC_STATE,
  type CourseSyllabus,
  type CourseSyllabusChapter,
  type CourseSyllabusChapterStatus,
  type SocraticState,
} from './teaching-types.js'

const STATUS_LABEL: Record<CourseSyllabusChapterStatus, string> = {
  pending: '待生成',
  generating: '生成中',
  ready: '待学习',
  in_progress: '学习中',
  passed: '已通过',
}

export function parseCourseSyllabus(value: unknown): CourseSyllabus | null {
  const parsed = CourseSyllabusSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function currentSyllabusChapterIndex(syllabus: CourseSyllabus): number {
  if (syllabus.chapters.length === 0) return 0
  const firstOpen = syllabus.chapters.findIndex((chapter) => chapter.status !== 'passed')
  if (firstOpen < 0) return syllabus.chapters.length - 1
  return firstOpen
}

export function currentSyllabusChapter(syllabus: CourseSyllabus): CourseSyllabusChapter | null {
  if (syllabus.chapters.length === 0) return null
  return syllabus.chapters[currentSyllabusChapterIndex(syllabus)] ?? null
}

export function isSyllabusChapterLocked(syllabus: CourseSyllabus, chapterId: string): boolean {
  const index = syllabus.chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index < 0) return true
  return index > currentSyllabusChapterIndex(syllabus)
}

export function formatSyllabusMarkdown(syllabus: CourseSyllabus): string {
  if (syllabus.chapters.length === 0) {
    if (syllabus.generation === 'generating') return '正在根据教材目录生成教学大纲…'
    if (syllabus.generation === 'error') {
      return syllabus.generationError?.trim() || '教学大纲生成失败。'
    }
    return ''
  }

  const total = syllabus.chapters.length
  const generated = syllabus.generatedCount
  const passed = syllabus.chapters.filter((chapter) => chapter.status === 'passed').length
  const hours =
    syllabus.totalHours ??
    syllabus.chapters.reduce((sum, chapter) => sum + (chapter.hours ?? 0), 0)
  const lines = [
    '# 教学大纲',
    '',
    `生成进度：${generated}/${total} 章 · 已通过：${passed}/${total} 章 · 总课时：${hours || '—'}`,
  ]
  if (syllabus.generation === 'generating') {
    lines.push('', '> 正在按章节生成教案与验收问题，请稍候。')
  }
  if (syllabus.generation === 'error' && syllabus.generationError) {
    lines.push('', `> ${syllabus.generationError}`)
  }

  for (const [index, chapter] of syllabus.chapters.entries()) {
    const hoursLabel = chapter.hours ? `${chapter.hours} 课时` : '课时待定'
    lines.push(
      '',
      `## ${index + 1}. ${chapter.title}（${hoursLabel}） · ${STATUS_LABEL[chapter.status]}`,
    )
    if (chapter.lessonPlan?.trim()) {
      lines.push('', '### 教案', '', chapter.lessonPlan.trim())
    } else if (chapter.status === 'generating') {
      lines.push('', '正在生成本章教案…')
    }
    if (chapter.assessmentQuestions.length > 0) {
      lines.push('', '### 验收问题')
      for (const [qIndex, question] of chapter.assessmentQuestions.entries()) {
        lines.push(`${qIndex + 1}. ${question}`)
      }
    }
  }

  return lines.join('\n').trim()
}

export function seedSyllabusFromCatalog(
  entries: Array<{ id: string; title: string }>,
): CourseSyllabus {
  const chapters: CourseSyllabusChapter[] = entries.map((entry, index) => ({
    id: entry.id,
    title: entry.title,
    assessmentQuestions: [],
    status: index === 0 ? 'generating' : 'pending',
  }))
  return {
    generation: 'generating',
    generatedCount: 0,
    chapters,
    updatedAt: Date.now(),
  }
}

export function applySyllabusLearningProgress(
  syllabus: CourseSyllabus | undefined,
  state: SocraticState,
): { syllabus: CourseSyllabus; state: SocraticState; advanced: boolean } {
  const current = syllabus ?? { ...EMPTY_COURSE_SYLLABUS }
  if (current.chapters.length === 0) {
    return { syllabus: current, state, advanced: false }
  }

  const chapters = current.chapters.map((chapter) => ({ ...chapter }))
  let openIndex = currentSyllabusChapterIndex(current)
  let advanced = false

  if (state.chapterPassed && chapters[openIndex] && chapters[openIndex].status !== 'passed') {
    chapters[openIndex] = { ...chapters[openIndex], status: 'passed' }
    advanced = true
    if (openIndex + 1 < chapters.length) {
      openIndex += 1
    }
  }

  for (const [index, chapter] of chapters.entries()) {
    if (chapter.status === 'pending' || chapter.status === 'generating') continue
    if (index < openIndex) {
      if (chapter.status !== 'passed') chapters[index] = { ...chapter, status: 'passed' }
    } else if (index === openIndex) {
      if (chapter.status !== 'passed') chapters[index] = { ...chapter, status: 'in_progress' }
    } else if (chapter.status === 'in_progress') {
      chapters[index] = { ...chapter, status: 'ready' }
    }
  }

  const nextSyllabus: CourseSyllabus = {
    ...current,
    chapters,
    updatedAt: Date.now(),
  }
  const syllabusChanged =
    advanced ||
    current.chapters.some((chapter, index) => chapter.status !== chapters[index]?.status)

  const nextState: SocraticState = {
    ...EMPTY_SOCRATIC_STATE,
    ...state,
    pathNodes: chapters.map((chapter) => chapter.title),
    pathIndex: openIndex,
    topic: chapters[openIndex]?.title,
    currentChapterId: chapters[openIndex]?.id,
    chapterPassed: false,
    updatedAt: Date.now(),
  }

  return {
    syllabus: syllabusChanged ? nextSyllabus : current,
    state: nextState,
    advanced,
  }
}
