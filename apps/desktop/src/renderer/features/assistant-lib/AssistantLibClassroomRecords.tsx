import {
  looksLikeAssistantLibDefaultClassroom,
  looksLikeAssistantLibGuideCourse,
  parseAssistantLibSessionMeta,
  parseCourseSyllabus,
  parseSocraticState,
  type ClassroomStudyRecord,
  type CourseSyllabusChapter,
  type Session,
  type SocraticState,
} from '@toolman/shared'
import { getDateLocale } from '../../i18n/date-locale'
import { useI18n } from '../../i18n/useI18n'
import { CommunityPanelHeader } from '../community/CommunityPanelHeader'

type Props = {
  session: Session | null
  onOpenSession?: (sessionId: string) => void
}

function formatDate(ts: number, locale: string): string {
  try {
    return new Date(ts).toLocaleString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(ts)
  }
}

function formatDuration(
  start: number,
  end: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const minutes = Math.max(1, Math.round(Math.max(0, end - start) / 60000))
  if (minutes < 60) return t('assistantLibPage.records.durationMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return t('assistantLibPage.records.durationHours', { count: hours })
  return t('assistantLibPage.records.durationHoursMinutes', { hours, minutes: rest })
}

function chapterStatusKey(status: CourseSyllabusChapter['status']): string {
  if (status === 'passed') return 'chapterPassed'
  if (status === 'in_progress') return 'chapterCurrent'
  if (status === 'generating') return 'chapterGenerating'
  if (status === 'pending') return 'chapterPending'
  return 'chapterReady'
}

function collectTags(state: SocraticState): Array<{ key: string; label: string; tone: string }> {
  const tags: Array<{ key: string; label: string; tone: string }> = []
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

export function AssistantLibClassroomRecords({ session, onOpenSession }: Props) {
  const { t, language } = useI18n()
  const dateLocale = getDateLocale(language)
  const meta = session ? parseAssistantLibSessionMeta(session.metadata) : null
  const state = parseSocraticState(session?.metadata)
  const syllabus = parseCourseSyllabus(meta?.syllabus)
  const chapters = syllabus?.chapters ?? []
  const studyRecords = [...(meta?.studyRecords ?? [])].reverse()
  const courseTitle = session
    ? looksLikeAssistantLibDefaultClassroom(session)
      ? t('assistantLibPage.defaultCourse')
      : looksLikeAssistantLibGuideCourse(session)
        ? t('assistantLibPage.guideCourse')
        : meta?.courseName?.trim() || session.title
    : t('assistantLibPage.defaultClassroom')
  const passedChapters = chapters.filter((item) => item.status === 'passed').length
  const tags = collectTags(state)

  const statCards = [
    {
      key: 'records',
      label: t('assistantLibPage.records.statLessons'),
      value: studyRecords.length,
    },
    {
      key: 'passed',
      label: t('assistantLibPage.records.statPassed'),
      value: passedChapters,
    },
    {
      key: 'chapters',
      label: t('assistantLibPage.records.statChapters'),
      value: chapters.length,
    },
    {
      key: 'qa',
      label: t('assistantLibPage.records.statQa'),
      value: session?.messageCount ?? 0,
    },
  ]

  return (
    <div className="tm-module-content tm-community-module-content">
      <div className="tm-community-market tm-community-user-center tm-alib-records">
        <CommunityPanelHeader
          title={t('assistantLibPage.records.title')}
          subtitle={t('assistantLibPage.records.subtitleNamed', { name: courseTitle })}
        />

        <div className="tm-kb-file-panel tm-community-user-center-body">
          {!session ? (
            <div className="tm-user-center-empty">{t('assistantLibPage.records.empty')}</div>
          ) : (
            <>
              <div
                className="tm-user-center-stat-grid"
                style={{ ['--tm-stat-cols' as string]: statCards.length }}
              >
                {statCards.map((item) => (
                  <div key={item.key} className="tm-user-center-stat-card">
                    <span className="tm-user-center-stat-label">{item.label}</span>
                    <span className="tm-user-center-stat-value">{item.value}</span>
                  </div>
                ))}
              </div>

              <section className="tm-alib-records-section">
                <div className="tm-alib-records-section-head">
                  <h3>{t('assistantLibPage.records.chapterList')}</h3>
                  {onOpenSession ? (
                    <button
                      type="button"
                      className="tm-user-center-text-btn tm-user-center-text-btn--primary"
                      onClick={() => onOpenSession(session.id)}
                    >
                      {t('assistantLibPage.records.openClassroom')}
                    </button>
                  ) : null}
                </div>
                {chapters.length === 0 ? (
                  <p className="tm-alib-records-empty-hint">
                    {t('assistantLibPage.records.chapterListEmpty')}
                  </p>
                ) : (
                  <ol className="tm-alib-records-chapter-list">
                    {chapters.map((chapter, index) => (
                      <li key={chapter.id} className="tm-alib-records-chapter-item">
                        <span className="tm-alib-records-chapter-index">{index + 1}</span>
                        <span className="tm-alib-records-chapter-title">{chapter.title}</span>
                        <span
                          className={`tm-alib-records-chapter-status tm-alib-records-chapter-status--${chapter.status}`}
                        >
                          {t(`assistantLibPage.records.${chapterStatusKey(chapter.status)}`)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="tm-alib-records-section">
                <div className="tm-alib-records-section-head">
                  <h3>{t('assistantLibPage.records.studyList')}</h3>
                  <span>
                    {t('assistantLibPage.records.listCount', { count: studyRecords.length })}
                  </span>
                </div>
                {studyRecords.length === 0 ? (
                  <p className="tm-alib-records-empty-hint">
                    {t('assistantLibPage.records.studyEmpty')}
                  </p>
                ) : (
                  <div className="tm-user-center-feed-list">
                    {studyRecords.map((record, index) => (
                      <StudyRecordCard
                        key={record.id}
                        record={record}
                        index={studyRecords.length - index}
                        dateLocale={dateLocale}
                        t={t}
                        fallbackTags={index === 0 ? tags : []}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StudyRecordCard({
  record,
  index,
  dateLocale,
  t,
  fallbackTags,
}: {
  record: ClassroomStudyRecord
  index: number
  dateLocale: string
  t: (key: string, vars?: Record<string, string | number>) => string
  fallbackTags: Array<{ key: string; label: string; tone: string }>
}) {
  const end = record.endedAt ?? Date.now()
  const tags =
    record.mastered.length > 0 || record.stuckPoints.length > 0
      ? [
          ...record.mastered.map((item) => ({
            key: `m:${item}`,
            label: item,
            tone: 'mastered',
          })),
          ...record.stuckPoints.map((item) => ({
            key: `s:${item}`,
            label: item,
            tone: 'stuck',
          })),
        ]
      : fallbackTags

  return (
    <article className="tm-user-center-feed-card">
      <div className="tm-user-center-feed-card-top">
        <div className="tm-alib-records-card-meta">
          <span className="tm-user-center-feed-tag">
            <span className="tm-user-center-feed-tag-dot" aria-hidden="true" />
            {t('assistantLibPage.records.lessonIndex', { index })}
          </span>
          <span className="tm-user-center-feed-date">{formatDate(record.startedAt, dateLocale)}</span>
        </div>
      </div>
      <h4 className="tm-user-center-feed-title">
        {record.chapterTitle?.trim() || t('assistantLibPage.records.chapterUnspecified')}
      </h4>
      <ul className="tm-alib-records-meta-list">
        <li>
          <span>{t('assistantLibPage.records.fieldDate')}</span>
          <span>{formatDate(record.startedAt, dateLocale)}</span>
        </li>
        <li>
          <span>{t('assistantLibPage.records.fieldDuration')}</span>
          <span>{formatDuration(record.startedAt, end, t)}</span>
        </li>
        <li>
          <span>{t('assistantLibPage.records.fieldQa')}</span>
          <span>{t('assistantLibPage.records.qaCount', { count: record.qaCount })}</span>
        </li>
      </ul>
      {tags.length === 0 ? (
        <p className="tm-alib-records-empty-hint">
          {t('assistantLibPage.records.understandingEmpty')}
        </p>
      ) : (
        <ul className="tm-alib-records-tag-list">
          {tags.map((tag) => (
            <li key={tag.key} className={`tm-alib-records-tag tm-alib-records-tag--${tag.tone}`}>
              {tag.label}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
