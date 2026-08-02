import { useMemo } from 'react'
import {
  parseAssistantLibSessionMeta,
  parseSocraticState,
  type Session,
  type SocraticState,
} from '@toolman/shared'
import { getDateLocale } from '../../i18n/date-locale'
import { useI18n } from '../../i18n/useI18n'
import { CommunityPanelHeader } from '../community/CommunityPanelHeader'

type Props = {
  sessions: Session[]
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

function formatDuration(session: Session, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const start = session.createdAt
  const end = session.lastMessageAt ?? session.updatedAt
  const minutes = Math.max(1, Math.round(Math.max(0, end - start) / 60000))
  if (minutes < 60) return t('assistantLibPage.records.durationMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (rest === 0) return t('assistantLibPage.records.durationHours', { count: hours })
  return t('assistantLibPage.records.durationHoursMinutes', { hours, minutes: rest })
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

export function AssistantLibClassroomRecords({ sessions, onOpenSession }: Props) {
  const { t, language } = useI18n()
  const dateLocale = getDateLocale(language)

  const stats = useMemo(() => {
    let mastered = 0
    let open = 0
    let qa = 0
    for (const session of sessions) {
      const state = parseSocraticState(session.metadata)
      mastered += state.mastered.length + state.confirmedClaims.length
      open += state.openAssumptions.length + state.stuckPoints.length
      qa += session.messageCount ?? 0
    }
    return {
      sessions: sessions.length,
      mastered,
      open,
      qa,
    }
  }, [sessions])

  const statCards = [
    { key: 'sessions', label: t('assistantLibPage.records.statSessions'), value: stats.sessions },
    { key: 'mastered', label: t('assistantLibPage.records.statMastered'), value: stats.mastered },
    { key: 'open', label: t('assistantLibPage.records.statOpen'), value: stats.open },
    { key: 'qa', label: t('assistantLibPage.records.statQa'), value: stats.qa },
  ]

  return (
    <div className="tm-module-content tm-community-module-content">
      <div className="tm-community-market tm-community-user-center tm-alib-records">
        <CommunityPanelHeader
          title={t('assistantLibPage.records.title')}
          subtitle={t('assistantLibPage.records.subtitle')}
        />

        <div className="tm-kb-file-panel tm-community-user-center-body">
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

          <div className="tm-user-center-feed">
            <div className="tm-user-center-feed-meta">
              <span>{t('assistantLibPage.records.listCount', { count: sessions.length })}</span>
              <span>{t('assistantLibPage.records.sortByLatest')}</span>
            </div>
            <div className="tm-user-center-feed-body">
              {sessions.length === 0 ? (
                <div className="tm-user-center-empty">{t('assistantLibPage.records.empty')}</div>
              ) : (
                <div className="tm-user-center-feed-list">
                  {sessions.map((session) => {
                    const state = parseSocraticState(session.metadata)
                    const meta = parseAssistantLibSessionMeta(session.metadata)
                    const title =
                      meta?.courseName?.trim() || session.title || t('assistantLibPage.defaultClassroom')
                    const tags = collectTags(state)
                    const chapters =
                      state.pathNodes.length > 0
                        ? state.pathNodes.join(' → ')
                        : state.topic || t('assistantLibPage.records.valueEmpty')
                    const mainContent =
                      state.confirmedClaims[0] ||
                      state.mastered[0] ||
                      t('assistantLibPage.records.valueEmpty')
                    const qaCount = session.messageCount ?? 0
                    const testCount = state.misconceptions.length + state.stuckPoints.length

                    return (
                      <article key={session.id} className="tm-user-center-feed-card">
                        <div className="tm-user-center-feed-card-top">
                          <div className="tm-alib-records-card-meta">
                            <span className="tm-user-center-feed-tag">
                              <span className="tm-user-center-feed-tag-dot" aria-hidden="true" />
                              {meta?.learningLabel || t('assistantLibPage.learningBadge')}
                            </span>
                            <span className="tm-user-center-feed-date">
                              {formatDate(session.createdAt, dateLocale)}
                            </span>
                          </div>
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
                        <h4 className="tm-user-center-feed-title">{title}</h4>
                        <dl className="tm-alib-records-fields">
                          <div>
                            <dt>{t('assistantLibPage.records.fieldDate')}</dt>
                            <dd>{formatDate(session.createdAt, dateLocale)}</dd>
                          </div>
                          <div>
                            <dt>{t('assistantLibPage.records.fieldDuration')}</dt>
                            <dd>{formatDuration(session, t)}</dd>
                          </div>
                          <div>
                            <dt>{t('assistantLibPage.records.fieldChapter')}</dt>
                            <dd>{chapters}</dd>
                          </div>
                          <div>
                            <dt>{t('assistantLibPage.records.fieldMain')}</dt>
                            <dd>{mainContent}</dd>
                          </div>
                          <div>
                            <dt>{t('assistantLibPage.records.fieldQa')}</dt>
                            <dd>{t('assistantLibPage.records.qaCount', { count: qaCount })}</dd>
                          </div>
                          <div>
                            <dt>{t('assistantLibPage.records.fieldTest')}</dt>
                            <dd>
                              {testCount > 0
                                ? t('assistantLibPage.records.testCount', { count: testCount })
                                : t('assistantLibPage.records.valueEmpty')}
                            </dd>
                          </div>
                          <div className="tm-alib-records-fields-span">
                            <dt>{t('assistantLibPage.records.fieldUnderstanding')}</dt>
                            <dd>
                              {tags.length === 0 ? (
                                t('assistantLibPage.records.understandingEmpty')
                              ) : (
                                <ul className="tm-alib-records-tag-list">
                                  {tags.map((tag) => (
                                    <li
                                      key={tag.key}
                                      className={`tm-alib-records-tag tm-alib-records-tag--${tag.tone}`}
                                    >
                                      {tag.label}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
