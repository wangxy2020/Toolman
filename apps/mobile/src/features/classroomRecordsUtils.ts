import type { ClassroomStudyRecord, CourseSyllabusChapter, SocraticState } from '@toolman/shared'

export type ClassroomRecordTagTone =
  | 'mastered'
  | 'confirmed'
  | 'assumption'
  | 'misconception'
  | 'stuck'

export type ClassroomRecordTag = {
  key: string
  label: string
  tone: ClassroomRecordTagTone
}

export function formatClassroomRecordDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(timestamp)
  }
}

export function formatClassroomRecordDuration(start: number, end: number): string {
  const minutes = Math.max(1, Math.round(Math.max(0, end - start) / 60000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return `${hours} 小时`
  return `${hours} 小时 ${rest} 分钟`
}

export function chapterStatusLabel(status: CourseSyllabusChapter['status']): string {
  if (status === 'passed') return '已通过'
  if (status === 'in_progress') return '学习中'
  if (status === 'generating') return '生成中'
  if (status === 'pending') return '待生成'
  return '未学习'
}

export function collectSocraticTags(
  state: SocraticState | null | undefined,
): ClassroomRecordTag[] {
  if (!state) return []
  const tags: ClassroomRecordTag[] = []
  for (const item of state.mastered) tags.push({ key: `m:${item}`, label: item, tone: 'mastered' })
  for (const item of state.confirmedClaims) {
    tags.push({ key: `c:${item}`, label: item, tone: 'confirmed' })
  }
  for (const item of state.openAssumptions) {
    tags.push({ key: `a:${item}`, label: item, tone: 'assumption' })
  }
  for (const item of state.misconceptions) {
    tags.push({ key: `x:${item}`, label: item, tone: 'misconception' })
  }
  for (const item of state.stuckPoints) tags.push({ key: `s:${item}`, label: item, tone: 'stuck' })
  return tags
}

export function studyRecordTags(
  record: ClassroomStudyRecord,
  fallbackTags: ClassroomRecordTag[],
): ClassroomRecordTag[] {
  if (record.mastered.length > 0 || record.stuckPoints.length > 0) {
    return [
      ...record.mastered.map((item) => ({
        key: `m:${item}`,
        label: item,
        tone: 'mastered' as const,
      })),
      ...record.stuckPoints.map((item) => ({
        key: `s:${item}`,
        label: item,
        tone: 'stuck' as const,
      })),
    ]
  }
  return fallbackTags
}

export function classroomRecordStatCards(input: {
  studyRecordCount: number
  passedChapters: number
  chapterCount: number
  qaCount: number
}): Array<{ key: string; label: string; value: number }> {
  return [
    { key: 'lessons', label: '上课次数', value: input.studyRecordCount },
    { key: 'passed', label: '已通过', value: input.passedChapters },
    { key: 'chapters', label: '章节', value: input.chapterCount },
    { key: 'qa', label: '问答轮次', value: input.qaCount },
  ]
}
