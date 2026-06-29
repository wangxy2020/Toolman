import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { recordProvenanceBeacon } from '../../lib/record-provenance-beacon'
import { SettingsToggle } from './SettingsShared'
import { AboutJoinUsModal } from './AboutJoinUsModal'
import { TOOLMAN_GITHUB_URL, ABOUT_EXTERNAL_LINK_URLS } from './about-settings.constants'
import { useAppUpdate } from './useAppUpdate'

const ABOUT_LINK_IDS = [
  'docs',
  'changelog',
  'website',
  'license',
  'thirdParty',
  'feedback',
  'enterprise',
  'email',
  'join',
] as const

type AboutLinkId = (typeof ABOUT_LINK_IDS)[number]

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function LinkRowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IconGithub({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.021C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

function getLinkActionKey(id: AboutLinkId): string {
  if (id === 'feedback') return 'settings.about.links.action.feedback'
  if (id === 'email') return 'settings.about.links.action.email'
  if (id === 'license' || id === 'thirdParty') return 'settings.about.links.action.view'
  return 'settings.about.links.action.view'
}

function resolveAboutLinkUrl(id: AboutLinkId): string | undefined {
  if (id in ABOUT_EXTERNAL_LINK_URLS) {
    return ABOUT_EXTERNAL_LINK_URLS[id as keyof typeof ABOUT_EXTERNAL_LINK_URLS]
  }
  return undefined
}

export function AboutSettingsPanel() {
  const { t } = useI18n()
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const {
    status,
    currentVersion,
    releaseNotes,
    updateButtonLabel,
    updateStatusHint,
    updateButtonDisabled,
    setAutoUpdate,
    runUpdateAction,
  } = useAppUpdate()

  const aboutLinks = useMemo(
    () =>
      ABOUT_LINK_IDS.map((id) => ({
        id,
        label: t(`settings.about.links.${id}`),
        action: t(getLinkActionKey(id)),
      })),
    [t],
  )

  const latestVersion = status?.latestVersion
  const showReleaseNotes = status?.updateAvailable && releaseNotes.length > 0
  const showUpdateProgress =
    status?.phase === 'downloading' && status.downloadProgress != null && status.downloadProgress >= 0
  const showStatusHint = updateStatusHint && status?.phase !== 'idle'

  useEffect(() => {
    recordProvenanceBeacon('app.about.view')
  }, [])

  return (
    <div className="tm-about-settings">
      <div className="tm-about-card">
        <div className="tm-about-card-header">
          <h2 className="tm-about-card-title">{t('settings.about.title')}</h2>
          <button
            type="button"
            className="tm-about-icon-btn tm-about-icon-btn--github"
            title="GitHub"
            aria-label={t('settings.about.githubAriaLabel')}
            onClick={() => openExternal(TOOLMAN_GITHUB_URL)}
          >
            <IconGithub size={24} />
          </button>
        </div>

        <div className="tm-about-hero">
          <div className="tm-about-logo">T</div>
          <div className="tm-about-hero-text">
            <h3 className="tm-about-name">Toolman</h3>
            <p className="tm-about-tagline">{t('settings.about.tagline')}</p>
            <span className="tm-about-version-badge">v{currentVersion}</span>
            {status?.channel ? (
              <span className="tm-about-version-badge"> · {status.channel}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="tm-about-outline-btn"
            disabled={updateButtonDisabled}
            onClick={() => void runUpdateAction()}
          >
            {updateButtonLabel}
          </button>
        </div>

        {showStatusHint ? <p className="tm-about-update-status">{updateStatusHint}</p> : null}
        {status?.error && status.phase !== 'error' ? (
          <p className="tm-about-update-hint">{status.error}</p>
        ) : null}

        {showUpdateProgress ? (
          <div className="tm-about-update-progress" role="progressbar" aria-valuenow={status.downloadProgress ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="tm-about-update-progress-bar"
              style={{ width: `${status.downloadProgress ?? 0}%` }}
            />
          </div>
        ) : null}

        <div className="tm-about-divider" />

        <div className="tm-about-toggle-row">
          <span>{t('settings.about.autoUpdate')}</span>
          <SettingsToggle
            checked={status?.autoUpdate ?? true}
            onChange={(checked) => void setAutoUpdate(checked)}
          />
        </div>
        <p className="tm-about-auto-update-hint">
          {status?.enabled ? t('settings.about.autoUpdateHint') : t('settings.about.autoUpdateDisabledHint')}
        </p>
      </div>

      {showReleaseNotes ? (
        <div className="tm-about-card">
          <div className="tm-about-changelog-head">
            <span className="tm-about-status-dot" aria-hidden="true" />
            <span>
              {t('settings.about.newVersionFound', { version: latestVersion ?? currentVersion })}
            </span>
          </div>
          <ul className="tm-about-changelog-list">
            {releaseNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tm-about-card tm-about-links-card">
        {aboutLinks.map((link) => {
          const externalUrl = resolveAboutLinkUrl(link.id)
          const isJoin = link.id === 'join'
          const isInteractive = isJoin || Boolean(externalUrl)
          return (
          <div key={link.id} className="tm-about-link-row">
            <div className="tm-about-link-label">
              <span className="tm-about-link-icon" aria-hidden="true">
                <LinkRowIcon />
              </span>
              <span>{link.label}</span>
            </div>
            <button
              type="button"
              className={[
                'tm-about-outline-btn',
                'tm-about-outline-btn--sm',
                isJoin ? 'tm-about-outline-btn--accent' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!isInteractive}
              onClick={
                isJoin
                  ? () => setJoinModalOpen(true)
                  : externalUrl
                    ? () => openExternal(externalUrl)
                    : undefined
              }
            >
              {link.action}
            </button>
          </div>
          )
        })}
      </div>

      {joinModalOpen ? <AboutJoinUsModal onClose={() => setJoinModalOpen(false)} /> : null}
    </div>
  )
}
