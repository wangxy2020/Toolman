import { useState } from 'react'

import { SettingsToggle } from '../settings/SettingsShared'
import { useI18n } from '../../i18n/useI18n'
import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'

const RSS_ADVANCED_STORAGE_KEY = 'toolman:rss-source-advanced'

interface RssAdvancedOptions {
  enableLongTextRender: boolean
  strictGuidValidation: boolean
}

const DEFAULT_ADVANCED: RssAdvancedOptions = {
  enableLongTextRender: true,
  strictGuidValidation: false,
}

function loadAdvancedOptions(): RssAdvancedOptions {
  try {
    const raw = localStorage.getItem(RSS_ADVANCED_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ADVANCED }
    return { ...DEFAULT_ADVANCED, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_ADVANCED }
  }
}

function saveAdvancedOptions(options: RssAdvancedOptions): void {
  localStorage.setItem(RSS_ADVANCED_STORAGE_KEY, JSON.stringify(options))
}

export function deriveSourceTitle(feedUrl: string, title: string, fallback = 'RSS 订阅'): string {
  const trimmed = title.trim()
  if (trimmed) return trimmed
  try {
    return new URL(feedUrl.trim()).hostname
  } catch {
    return fallback
  }
}

export interface RssSourceConfigInput {
  title: string
  feedUrl: string
  fetchIntervalMinutes: number
  advanced: RssAdvancedOptions
}

interface Props {
  creating?: boolean
  error?: string | null
  onClose: () => void
  onSave: (input: RssSourceConfigInput) => void | Promise<void>
}

export function RssSourceConfigModal({ creating = false, error, onClose, onSave }: Props) {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [fetchIntervalMinutes, setFetchIntervalMinutes] = useState('30')
  const [advanced, setAdvanced] = useState<RssAdvancedOptions>(() => loadAdvancedOptions())

  const updateAdvanced = (patch: Partial<RssAdvancedOptions>) => {
    setAdvanced((prev) => {
      const next = { ...prev, ...patch }
      saveAdvancedOptions(next)
      return next
    })
  }

  const handleSave = () => {
    const trimmedFeedUrl = feedUrl.trim()
    if (!trimmedFeedUrl) return

    const interval = Number.parseInt(fetchIntervalMinutes, 10)
    if (!Number.isFinite(interval) || interval < 5) return

    void onSave({
      title: deriveSourceTitle(trimmedFeedUrl, title, t('communityPage.rss.defaultTitle')),
      feedUrl: trimmedFeedUrl,
      fetchIntervalMinutes: interval,
      advanced,
    })
  }

  const canSave = feedUrl.trim().length > 0 && !creating

  return (
    <CommunityPublishModalShell
      title={t('communityPage.rss.title')}
      ariaLabel={t('communityPage.rss.title')}
      stacked
      onClose={onClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={onClose}
          cancelDisabled={creating}
          confirmLabel={creating ? t('communityPage.rss.saving') : t('communityPage.rss.save')}
          confirmDisabled={!canSave}
          onConfirm={handleSave}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}

      <div className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.rss.feedUrl')} <span className="tm-community-publish-required">*</span>
        </span>
        <input
          className="tm-community-publish-input tm-community-publish-input--mono"
          type="url"
          value={feedUrl}
          placeholder="https://example.com/feed.xml"
          onChange={(event) => setFeedUrl(event.target.value)}
        />
      </div>

      <div className="tm-community-publish-grid">
        <label className="tm-community-publish-field">
          <span className="tm-community-publish-label">
            {t('communityPage.rss.sourceName')}{' '}
            <span className="tm-community-publish-label-optional">{t('communityPage.rss.optional')}</span>
          </span>
          <input
            type="text"
            className="tm-community-publish-input"
            value={title}
            placeholder={t('communityPage.rss.namePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="tm-community-publish-field">
          <span className="tm-community-publish-label">{t('communityPage.rss.updateInterval')}</span>
          <div className="tm-community-publish-interval">
            <input
              className="tm-community-publish-interval-input"
              type="number"
              min={5}
              max={1440}
              value={fetchIntervalMinutes}
              onChange={(event) => setFetchIntervalMinutes(event.target.value)}
            />
            <span className="tm-community-publish-interval-suffix">min</span>
          </div>
        </div>
      </div>

      <div className="tm-community-publish-advanced">
        <span className="tm-community-publish-label">{t('communityPage.rss.advancedOptions')}</span>

        <div className="tm-community-publish-upload-card">
          <div className="tm-community-publish-toggle-row">
            <div className="tm-community-publish-toggle-copy">
              <span className="tm-community-publish-toggle-title">{t('communityPage.rss.longTextRender')}</span>
              <p className="tm-community-publish-toggle-desc">{t('communityPage.rss.longTextRenderDesc')}</p>
            </div>
            <SettingsToggle
              checked={advanced.enableLongTextRender}
              onChange={(enableLongTextRender) => updateAdvanced({ enableLongTextRender })}
            />
          </div>

          <div className="tm-community-publish-toggle-row tm-community-publish-toggle-row--divider">
            <div className="tm-community-publish-toggle-copy">
              <span className="tm-community-publish-toggle-title">{t('communityPage.rss.strictGuid')}</span>
              <p className="tm-community-publish-toggle-desc">{t('communityPage.rss.strictGuidDesc')}</p>
            </div>
            <SettingsToggle
              checked={advanced.strictGuidValidation}
              onChange={(strictGuidValidation) => updateAdvanced({ strictGuidValidation })}
            />
          </div>
        </div>
      </div>
    </CommunityPublishModalShell>
  )
}