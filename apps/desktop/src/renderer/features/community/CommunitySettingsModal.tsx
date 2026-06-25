import { useCallback, useEffect, useState } from 'react'

import type { CommunityHubHealthOutput, CommunityHubStatusOutput } from '@toolman/shared'

import { IconRefresh, IconX } from '../../components/icons'
import {
  getCommunityHubHealth,
  getCommunityHubStatus,
} from './community-api.client'
import { notifyCommunityNewsSourcesChanged } from './community-events'
import { NewsSourcesPanel } from './NewsSourcesPanel'
import { CommunityFederationSettingsPanel } from './CommunityFederationSettingsPanel'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  onClose: () => void
}

type SettingsTab = 'hub' | 'federation' | 'rss'

export function CommunitySettingsModal({ onClose }: Props) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SettingsTab>('hub')
  const [hubStatus, setHubStatus] = useState<CommunityHubStatusOutput | null>(null)
  const [hubHealth, setHubHealth] = useState<CommunityHubHealthOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHub = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await getCommunityHubStatus()
      setHubStatus(status)
      if (status.running) {
        const health = await getCommunityHubHealth()
        setHubHealth(health)
      } else {
        setHubHealth(null)
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : t('communityPage.hub.loadFailed')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHub()
  }, [loadHub])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'hub', label: t('communityPage.tabs.hub') },
    { id: 'federation', label: t('communityPage.tabs.federation') },
    { id: 'rss', label: t('communityPage.tabs.news') },
  ]

  const hubStatusText = !hubStatus
    ? t('common.loading')
    : hubStatus.offlineReadOnly
      ? t('communityPage.hub.offlineReadonly')
      : hubStatus.running
        ? t('communityPage.hub.connected')
        : hubStatus.error
          ? t('communityPage.hub.unavailable')
          : t('communityPage.hub.disconnected')

  return (
    <div className="tm-modal-overlay tm-modal-overlay--group-settings" onClick={onClose}>
      <div
        className="tm-group-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-group-settings-modal-header">
          <div className="tm-group-settings-modal-heading">
            <h3 id="community-settings-title" className="tm-group-settings-modal-title">
              <span className="tm-group-settings-modal-title-dot" aria-hidden="true" />
              {t('communityPage.settings')}
            </h3>
            <p className="tm-group-settings-modal-subtitle">{t('communityPage.settingsSubtitle')}</p>
          </div>
          <button
            type="button"
            className="tm-group-settings-modal-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="tm-group-settings-modal-body">
          <nav className="tm-group-settings-modal-nav" aria-label={t('communityPage.settingsNavAria')}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-group-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-group-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tm-group-settings-modal-content">
            {error ? <div className="tm-group-settings-error">{error}</div> : null}

            {activeTab === 'hub' ? (
              <div className="tm-group-settings-form">
                <div className="tm-group-settings-field">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span className="tm-group-settings-section-title">{t('communityPage.hub.statusSection')}</span>
                    <button
                      type="button"
                      className="tm-group-settings-inline-btn"
                      disabled={loading}
                      onClick={() => void loadHub()}
                    >
                      <IconRefresh size={14} className={loading ? 'tm-icon-spin' : undefined} />
                      {t('communityPage.refresh')}
                    </button>
                  </div>
                </div>

                <div className="tm-group-settings-field">
                  <span className="tm-group-settings-label">{t('communityPage.hub.connectionMode')}</span>
                  <span>{hubStatus?.mode === 'remote' ? t('communityPage.hub.remoteMode') : t('communityPage.hub.localMode')}</span>
                </div>
                <div className="tm-group-settings-field">
                  <span className="tm-group-settings-label">{t('communityPage.hub.runStatus')}</span>
                  <span>{hubStatusText}</span>
                </div>
                {hubStatus?.baseUrl ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">{t('communityPage.hub.address')}</span>
                    <span>{hubStatus.baseUrl}</span>
                  </div>
                ) : null}
                {hubStatus?.port ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">{t('communityPage.hub.port')}</span>
                    <span>{hubStatus.port}</span>
                  </div>
                ) : null}
                {hubHealth?.version ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">{t('communityPage.hub.version')}</span>
                    <span>{hubHealth.version}</span>
                  </div>
                ) : null}
                {hubHealth?.dataDir ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">{t('communityPage.hub.dataDir')}</span>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {hubHealth.dataDir}
                    </span>
                  </div>
                ) : null}
                {hubHealth?.userCount != null ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">{t('communityPage.hub.communityUser')}</span>
                    <span>{hubHealth.userCount}</span>
                  </div>
                ) : null}
                {hubHealth?.resourceCount != null ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">{t('communityPage.hub.resourceCount')}</span>
                    <span>{hubHealth.resourceCount}</span>
                  </div>
                ) : null}
                {hubStatus?.error ? (
                  <div className="tm-group-settings-error tm-group-settings-error--inline">
                    {hubStatus.error}
                  </div>
                ) : null}

                <p className="tm-group-settings-hint">
                  {hubStatus?.mode === 'remote'
                    ? t('communityPage.hub.remoteHint')
                    : t('communityPage.hub.localHint')}
                </p>
              </div>
            ) : activeTab === 'federation' ? (
              <CommunityFederationSettingsPanel embedded />
            ) : (
              <NewsSourcesPanel onChanged={() => notifyCommunityNewsSourcesChanged()} embedded />
            )}
          </div>
        </div>

        <footer className="tm-group-settings-modal-footer">
          <div className="tm-group-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--primary"
              onClick={onClose}
            >
              {t('common.close')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
