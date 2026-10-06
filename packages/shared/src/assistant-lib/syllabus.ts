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

  let previousGroup = ''
  for (const [index, chapter] of syllabus.chapters.entries()) {
    const groupTitle = chapter.groupTitle ? classroomChapterTitle(chapter.groupTitle) : ''
    if (groupTitle && groupTitle !== previousGroup) {
      lines.push('', `## ${groupTitle}`)
      previousGroup = groupTitle
    } else if (!groupTitle) {
      previousGroup = ''
    }
    const hoursLabel = chapter.hours ? `${chapter.hours} 课时` : '课时待定'
    const title = classroomChapterTitle(chapter.title) || chapter.title.trim()
    lines.push(
      '',
      `## ${index + 1}. ${title}（${hoursLabel}） · ${STATUS_LABEL[chapter.status]}`,
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

  return stripSyllabusHeadingBullets(lines.join('\n').trim())
}

const CHAPTER_HEADING = /^##\s+(\d+)\.\s+(.+)$/
const CHAPTER_STATUS_SUFFIX = /\s*·\s*[^\s·]+$/
const CHAPTER_HOURS_SUFFIX = /（[^）]*课时[^）]*）/g
const CHAPTER_BULLET = /[●⚫⬤•]/g

/** Chapter name without the filled bullet or a leftover leading hyphen. */
export function classroomChapterTitle(title: string): string {
  const cleaned = title.replace(CHAPTER_BULLET, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.replace(/^[-–—]\s*/, '').trim()
}

/** Sidebar chapter label: one leading hyphen, without the filled bullet. */
export function formatClassroomChapterLabel(title: string): string {
  const body = classroomChapterTitle(title)
  return body ? `- ${body}` : '-'
}

export function chapterTitleFromSyllabusHeading(headingBody: string): string {
  const title = classroomChapterTitle(
    headingBody
      .replace(CHAPTER_HOURS_SUFFIX, '')
      .replace(CHAPTER_STATUS_SUFFIX, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  return title
}

const SYLLABUS_HEADING_LINE = /^(##\s+)(?:(\d+)\.\s+)?(.+)$/

function stripBulletChars(line: string): string {
  return line
    .replace(/^[ \t]*[●⚫⬤•]+[ \t]*/g, '')
    .replace(CHAPTER_BULLET, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/g, '')
}

/** Drop filled bullets from a saved syllabus, including lesson-plan body text. */
export function stripSyllabusHeadingBullets(markdown: string): string {
  if (!/[●⚫⬤•]/.test(markdown)) return markdown
  return markdown
    .split('\n')
    .map((line) => {
      if (!/[●⚫⬤•]/.test(line)) return line
      const match = SYLLABUS_HEADING_LINE.exec(line)
      if (!match?.[3]) return stripBulletChars(line)
      const prefix = match[1] ?? '## '
      const number = match[2]
      let body = match[3]
      const status = CHAPTER_STATUS_SUFFIX.exec(body)
      if (status && status.index > 0) body = body.slice(0, status.index)
      const hours = body.match(CHAPTER_HOURS_SUFFIX)?.[0] ?? ''
      body = body.replace(CHAPTER_HOURS_SUFFIX, '')
      const title = classroomChapterTitle(body)
      if (!title) return stripBulletChars(line)
      const statusText = status?.[0] ?? ''
      if (number) return `${prefix}${number}. ${title}${hours}${statusText}`
      return `${prefix}${title}`
    })
    .join('\n')
}

/**
 * Copy `## n. title` lines back onto the syllabus.
 * A renamed heading updates that chapter. A removed heading drops that chapter.
 * Markdown with no numbered headings leaves the syllabus unchanged.
 */
export function applySyllabusTitlesFromMarkdown(
  syllabus: CourseSyllabus,
  markdown: string,
): CourseSyllabus {
  const titles = new Map<number, string>()
  for (const line of markdown.split('\n')) {
    const match = CHAPTER_HEADING.exec(line.trim())
    if (!match) continue
    const index = Number(match[1])
    const title = chapterTitleFromSyllabusHeading(match[2] ?? '')
    if (!Number.isInteger(index) || index < 1 || !title) continue
    titles.set(index, title)
  }
  if (titles.size === 0) return syllabus
  let changed = false
  const chapters: CourseSyllabusChapter[] = []
  for (const [index, chapter] of syllabus.chapters.entries()) {
    const next = titles.get(index + 1)
    if (!next) {
      changed = true
      continue
    }
    if (next === chapter.title) {
      chapters.push(chapter)
      continue
    }
    changed = true
    chapters.push({ ...chapter, title: next })
  }
  if (!changed) return syllabus
  return { ...syllabus, chapters, updatedAt: Date.now() }
}

const CN_VOLUME = /^第[一二三四五六七八九十百千零〇两0-9]+\s*章/
const BACK_MATTER = /^(附录|附表|索引|后记|参考文献|名词索引|元素周期表|中英文名词对照|部分中英文)/

/** 绪言 / 绪论 stay out of the lesson list even if the outline still contains them. */
export function isPrefaceOutlineTitle(title: string): boolean {
  const key = title.replace(/[\s·・]/g, '')
  return /^(绪言|绪论|引言|导言|导论)/.test(key)
}

/** 附录 and the back matter after the last 实验活动 are not lessons of the previous 章. */
export function isBackMatterOutlineTitle(title: string): boolean {
  const key = title.replace(/[\s·・.．]/g, '')
  return BACK_MATTER.test(key)
}

function isVolumeHeading(title: string): boolean {
  return CN_VOLUME.test(title.trim())
}

/**
 * A 章 that is followed by 节 (or 整理与提升) is only a heading.
 * Those following rows are the lessons. A 章 with nothing under it stays a lesson.
 */
export function teachableSyllabusEntries(
  entries: Array<{ id: string; title: string }>,
): Array<{ id: string; title: string; groupTitle?: string }> {
  const visible = entries.filter((entry) => entry.title.trim() && !isPrefaceOutlineTitle(entry.title))
  const volumeHasLessons = new Set<number>()
  for (let index = 0; index < visible.length; index += 1) {
    if (!isVolumeHeading(visible[index]?.title ?? '')) continue
    for (let nextIndex = index + 1; nextIndex < visible.length; nextIndex += 1) {
      const nextTitle = visible[nextIndex]?.title ?? ''
      if (isVolumeHeading(nextTitle) || isBackMatterOutlineTitle(nextTitle)) break
      volumeHasLessons.add(index)
      break
    }
  }

  let groupTitle: string | undefined
  const lessons: Array<{ id: string; title: string; groupTitle?: string }> = []
  for (let index = 0; index < visible.length; index += 1) {
    const entry = visible[index]
    if (!entry) continue
    if (isVolumeHeading(entry.title) && volumeHasLessons.has(index)) {
      groupTitle = entry.title.trim()
      continue
    }
    if (isVolumeHeading(entry.title) || isBackMatterOutlineTitle(entry.title)) {
      groupTitle = undefined
    }
    lessons.push({
      id: entry.id,
      title: entry.title.trim(),
      ...(groupTitle ? { groupTitle } : {}),
    })
  }
  return lessons
}

/**
 * Group labels for the sidebar. A 章 stops at 附录 / 后记, even when an older
 * syllabus still stored that back matter under the chapter.
 */
export function syllabusMenuGroupTitles(
  chapters: Array<{ title: string; groupTitle?: string }>,
): Array<string | undefined> {
  let blockedGroup: string | undefined
  return chapters.map((chapter) => {
    const group = chapter.groupTitle?.trim() || undefined
    if (!group) {
      blockedGroup = undefined
      return undefined
    }
    if (blockedGroup && blockedGroup !== group) blockedGroup = undefined
    if (isBackMatterOutlineTitle(chapter.title) || blockedGroup === group) {
      blockedGroup = group
      return undefined
    }
    return group
  })
}

export function seedSyllabusFromCatalog(
  entries: Array<{ id: string; title: string }>,
): CourseSyllabus {
  const chapters: CourseSyllabusChapter[] = teachableSyllabusEntries(entries).map(
    (entry, index) => ({
      id: entry.id,
      title: entry.title,
      ...(entry.groupTitle ? { groupTitle: entry.groupTitle } : {}),
      assessmentQuestions: [],
      status: index === 0 ? 'generating' : 'pending',
    }),
  )
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
