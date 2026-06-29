import { useState } from 'react'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus, IconRefresh, IconTrash } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { formatNewsDate } from './community-news-utils'
import {
  CommunityPublishModalError,
  CommunityPublishModalNotice,
} from './CommunityPublishModalShell'
import { RssSourceConfigModal, type RssSourceConfigInput } from './RssSourceConfigModal'
import { useCommunityNewsSources } from './useCommunityNewsSources'
import { useCommunityUser } from './useCommunityUser'

interface Props {
  onChanged?: () => void
  embedded?: boolean
}

export function NewsSourcesPanel({ onChanged, embedded = false }: Props) {
  const { t } = useI18n()
  const user = useCommunityUser()
  const sources = useCommunityNewsSources(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; title: string } | null>(null)

  const handleFetch = async (sourceId: string) => {
    await sources.fetchSource(sourceId)
    onChanged?.()
  }

  const handleCreate = async (input: RssSourceConfigInput) => {
    if (!user.profile) {
      sources.setError(t('communityPage.newsSources.loginRequired'))
      return
    }

    const interval = input.fetchIntervalMinutes
    if (!Number.isFinite(interval) || interval < 5) {
      sources.setError(t('communityPage.newsSources.minInterval'))
      return
    }

    try {
      const source = await sources.createSource({
        title: input.title,
        feedUrl: input.feedUrl,
        category: 'general',
        fetchIntervalMinutes: interval,
      })
      setShowAddForm(false)
      await sources.fetchSource(source.id)
      onChanged?.()
    } catch {
      // error handled in hook
    }
  }

  const handleConfirmDelete = async () => {
    if (!sourceToDelete) return
    const sourceId = sourceToDelete.id
    setSourceToDelete(null)
    try {
      await sources.deleteSource(sourceId)
      onChanged?.()
    } catch {
      // error handled in hook
    }
  }

  return (
    <>
      <div
        className={
          embedded
            ? 'tm-group-settings-form tm-community-news-sources-panel'
            : 'tm-community-news-sources-panel'
        }
      >
        <div className="tm-community-news-sources-header">
          {!embedded ? (
            <p className="tm-community-publish-modal-subtitle">{t('communityPage.newsSources.subtitle')}</p>
          ) : (
            <span className="tm-group-settings-section-title">{t('communityPage.newsSources.sectionTitle')}</span>
          )}

          {sources.error ? <CommunityPublishModalError message={sources.error} /> : null}
          {sources.success ? <CommunityPublishModalNotice message={sources.success} /> : null}

          <div className="tm-community-news-sources-toolbar">
            <button
              type="button"
              className="tm-community-publish-toolbar-btn tm-community-publish-toolbar-btn--primary"
              disabled={!user.profile || sources.creating}
              onClick={() => setShowAddForm(true)}
            >
              <IconPlus size={14} />
              {t('communityPage.newsSources.addSource')}
            </button>
            <button
              type="button"
              className="tm-community-publish-toolbar-btn"
              disabled={sources.loading}
              onClick={() => void sources.load()}
            >
              <IconRefresh size={14} />
              {t('communityPage.newsSources.refreshList')}
            </button>
          </div>
        </div>

        <div className="tm-community-news-sources-body">
          {!user.profile ? (
            <p className="tm-community-publish-modal-hint">{t('communityPage.newsSources.loginHint')}</p>
          ) : null}

          {sources.loading && sources.items.length === 0 ? (
            <div className="tm-community-publish-modal-empty">{t('communityPage.newsSources.loading')}</div>
          ) : sources.items.length === 0 ? (
            <div className="tm-community-publish-modal-empty">{t('communityPage.newsSources.empty')}</div>
          ) : (
            <ul className="tm-community-news-sources-list">
              {sources.items.map((source) => (
                <li key={source.id} className="tm-community-news-source-item">
                  <div className="tm-community-news-source-main">
                    <div className="tm-community-news-source-title-row">
                      <span className="tm-community-news-source-title">{source.title}</span>
                      <span
                        className={[
                          'tm-community-news-source-status',
                          source.enabled
                            ? 'tm-community-news-source-status--enabled'
                            : 'tm-community-news-source-status--disabled',
                        ].join(' ')}
                      >
                        {source.enabled
                          ? t('communityPage.newsSources.enabled')
                          : t('communityPage.newsSources.disabled')}
                      </span>
                    </div>
                    <p className="tm-community-news-source-url">{source.feedUrl}</p>
                    <p className="tm-community-news-source-meta">
                      {source.category} · {t('communityPage.newsSources.interval', { minutes: source.fetchIntervalMinutes })}
                      {source.lastFetchedAt
                        ? ` · ${t('communityPage.newsSources.lastFetch', { time: formatNewsDate(source.lastFetchedAt) })}`
                        : ` · ${t('communityPage.newsSources.neverFetched')}`}
                    </p>
                    {source.lastError ? (
                      <p className="tm-community-news-source-error">{source.lastError}</p>
                    ) : null}
                  </div>
                  <div className="tm-community-news-source-actions">
                    <button
                      type="button"
                      className="tm-community-publish-toolbar-btn"
                      disabled={!source.enabled || sources.fetchingId === source.id}
                      onClick={() => void handleFetch(source.id)}
                    >
                      {sources.fetchingId === source.id
                        ? t('communityPage.newsSources.fetching')
                        : t('communityPage.newsSources.fetchNow')}
                    </button>
                    {user.profile ? (
                      <button
                        type="button"
                        className="tm-community-publish-toolbar-btn tm-community-publish-toolbar-btn--ghost"
                        title={t('common.delete')}
                        aria-label={t('communityPage.newsSources.deleteTitle')}
                        disabled={sources.deletingId === source.id}
                        onClick={() => setSourceToDelete({ id: source.id, title: source.title })}
                      >
                        <IconTrash size={14} />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showAddForm && user.profile ? (
        <RssSourceConfigModal
          creating={sources.creating}
          error={sources.error}
          onClose={() => {
            sources.setError(null)
            setShowAddForm(false)
          }}
          onSave={handleCreate}
        />
      ) : null}

      {sourceToDelete ? (
        <ConfirmDialog
          title={t('communityPage.newsSources.deleteTitle')}
          message={t('communityPage.newsSources.deleteMessage', { title: sourceToDelete.title })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setSourceToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </>
  )
}
