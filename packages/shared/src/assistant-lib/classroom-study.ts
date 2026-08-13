import type { ClassroomStudyRecord, CourseSyllabus, SocraticState } from './teaching-types.js'
import { currentSyllabusChapter } from './syllabus.js'

export function appendClassroomStudyRecord(
  records: ClassroomStudyRecord[] | undefined,
  next: Omit<ClassroomStudyRecord, 'id' | 'startedAt' | 'mastered' | 'stuckPoints' | 'qaCount'> &
    Partial<Pick<ClassroomStudyRecord, 'id' | 'startedAt' | 'mastered' | 'stuckPoints' | 'qaCount'>>,
): ClassroomStudyRecord[] {
  const now = Date.now()
  const closed = (records ?? []).map((item) =>
    item.endedAt ? item : { ...item, endedAt: now },
  )
  return [
    ...closed,
    {
      id: next.id ?? crypto.randomUUID(),
      startedAt: next.startedAt ?? now,
      chapterId: next.chapterId,
      chapterTitle: next.chapterTitle,
      summary: next.summary,
      mastered: next.mastered ?? [],
      stuckPoints: next.stuckPoints ?? [],
      qaCount: next.qaCount ?? 0,
    },
  ]
}

export function isClassroomLive(records: ClassroomStudyRecord[] | undefined): boolean {
  const last = records?.[records.length - 1]
  return Boolean(last && !last.endedAt)
}

export function endOpenClassroomStudyRecords(
  records: ClassroomStudyRecord[] | undefined,
): ClassroomStudyRecord[] {
  const now = Date.now()
  return (records ?? []).map((item) => (item.endedAt ? item : { ...item, endedAt: now }))
}

export function touchLatestClassroomStudyRecord(
  records: ClassroomStudyRecord[] | undefined,
  patch: Partial<Pick<ClassroomStudyRecord, 'mastered' | 'stuckPoints' | 'qaCount' | 'summary'>>,
): ClassroomStudyRecord[] {
  const list = records ?? []
  const last = list[list.length - 1]
  if (!last || last.endedAt) return list
  return [...list.slice(0, -1), { ...last, ...patch }]
}

export function buildStartClassUserMessage(options: {
  courseName: string
  syllabus?: CourseSyllabus
  records?: ClassroomStudyRecord[]
  state: SocraticState
}): string {
  const chapter = options.syllabus ? currentSyllabusChapter(options.syllabus) : null
  const records = options.records ?? []
  const passed =
    options.syllabus?.chapters.filter((item) => item.status === 'passed').length ?? 0
  const total = options.syllabus?.chapters.length ?? 0
  const recent = records
    .slice(-3)
    .map((item, index) => {
      const title = item.chapterTitle?.trim() || '未指定章节'
      const mastered = item.mastered.length > 0 ? item.mastered.join('、') : '无'
      return `${index + 1}. ${title}（掌握：${mastered}）`
    })
    .join('\n')

  return [
    '开始上课。',
    '请根据本课教学大纲与课堂记录，发一条开场白并准备开始上课。',
    '若尚无学习记录，从当前未通过章节开始；若有记录，先简要回顾再继续当前章节。',
    '不要一次讲完整章，也不要进入未解锁章节。',
    '',
    `课程：${options.courseName}`,
    chapter ? `当前章节：${chapter.title}` : '当前章节：尚未生成教学大纲',
    total > 0 ? `大纲进度：已通过 ${passed}/${total} 章` : '',
    options.state.topic ? `上次主题：${options.state.topic}` : '',
    recent ? `本课近期记录：\n${recent}` : '本课尚无课堂记录。',
  ]
    .filter(Boolean)
    .join('\n')
}
