import { useEffect, useState } from 'react'
import type { Assistant, ChannelPlatformId, ImChannelConfigPublic } from '@toolman/shared'
import { IconCopy } from '../../components/icons'
import { getChannelPlatformLabel, resolveChannelDisplayName } from '../../i18n/settings-labels'
import { useI18n } from '../../i18n/useI18n'
import { ChannelFormLabel } from './ChannelFormLabel'
import {
  SettingsInput,
  SettingsSelect,
  SettingsToggle,
} from './SettingsShared'
import {
  getAppSecretLabel,
  getConnectionHint,
  getDomainPlaceholder,
  getEnableDescription,
  hasWebhookUrl,
} from './channel-config-utils'

export interface ChannelConfigModalProps {
  config: ImChannelConfigPublic
  assistants: Assistant[]
  webhookPath: string
  onClose: () => void
  onSave: (config: Partial<ImChannelConfigPublic> & { platform: ChannelPlatformId; appSecret?: string; encryptKey?: string }) => void
  onTest: (platform: ChannelPlatformId) => Promise<string | null>
}

export function ChannelConfigModal({
  config,
  assistants,
  webhookPath,
  onClose,
  onSave,
  onTest,
}: ChannelConfigModalProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(config)
  const [appSecret, setAppSecret] = useState('')
  const [encryptKey, setEncryptKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDraft({
      ...config,
      name: resolveChannelDisplayName(config.platform, config.name, t),
    })
    setAppSecret('')
    setEncryptKey('')
    setTestMessage(null)
    setCopied(false)
  }, [config, t])

  const platformName = getChannelPlatformLabel(draft.platform, t)
  const connectionHint = getConnectionHint(draft.platform, t)
  const showWebhook = hasWebhookUrl(draft.platform)

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookPath)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setTestMessage(t('settings.channels.webhook.copyFailed'))
    }
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--channel-config" onClick={onClose}>
      <div
        className="tm-channel-config-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-channel-config-header">
          <h3 className="tm-channel-config-title">
            <span className="tm-channel-config-title-dot" aria-hidden="true" />
            {t('settings.channels.modal.title', { platform: platformName })}
          </h3>
          <button type="button" className="tm-channel-config-close" aria-label={t('common.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-channel-config-body">
          <div className="tm-channel-config-card">
            <div className="tm-channel-config-enable-row">
              <div className="tm-channel-config-enable-copy">
                <span className="tm-channel-config-enable-title">
                  {t('settings.channels.modal.enableTitle', { platform: platformName })}
                </span>
                <p className="tm-channel-config-enable-desc">
                  {getEnableDescription(draft.platform, platformName, t)}
                </p>
              </div>
              <SettingsToggle
                checked={draft.enabled}
                onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
              />
            </div>

            {showWebhook ? (
              <div className="tm-channel-config-webhook">
                <ChannelFormLabel>{t('settings.channels.modal.webhookLabel')}</ChannelFormLabel>
                <div className="tm-channel-config-webhook-input">
                  <input
                    className="tm-channel-config-webhook-value"
                    type="text"
                    readOnly
                    value={webhookPath}
                  />
                  <button
                    type="button"
                    className="tm-channel-config-webhook-copy"
                    onClick={() => void handleCopyWebhook()}
                  >
                    <IconCopy size={14} />
                    {copied ? t('settings.channels.modal.copied') : t('settings.channels.modal.copy')}
                  </button>
                </div>
                {connectionHint ? (
                  <p className="tm-channel-config-webhook-hint">{connectionHint}</p>
                ) : null}
              </div>
            ) : connectionHint ? (
              <p className="tm-channel-config-platform-hint">{connectionHint}</p>
            ) : null}
          </div>

          <div className="tm-channel-config-grid-2">
            <div className="tm-channel-config-field">
              <ChannelFormLabel>{t('settings.channels.modal.channelName')}</ChannelFormLabel>
              <SettingsInput
                value={draft.name}
                onChange={(name) => setDraft((prev) => ({ ...prev, name }))}
              />
            </div>

            <div className="tm-channel-config-field">
              <ChannelFormLabel>{t('settings.channels.modal.bindAssistant')}</ChannelFormLabel>
              <SettingsSelect
                value={draft.assistantId || ''}
                options={[
                  { value: '', label: t('settings.channels.modal.selectAssistant') },
                  ...assistants.map((assistant) => ({
                    value: assistant.id,
                    label: assistant.name,
                  })),
                ]}
                onChange={(assistantId) => setDraft((prev) => ({ ...prev, assistantId }))}
              />
            </div>
          </div>

          <div className="tm-channel-config-section">
            <span className="tm-channel-config-section-title">
              {t('settings.channels.credentials.sectionTitle', { platform: platformName })}
            </span>

            <div className="tm-channel-config-card tm-channel-config-card--flat">
              <div className="tm-channel-config-field">
                <ChannelFormLabel required>{t('settings.channels.credentials.appId')}</ChannelFormLabel>
                <SettingsInput
                  value={draft.appId}
                  placeholder={t('settings.channels.credentials.appIdPlaceholder')}
                  onChange={(appId) => setDraft((prev) => ({ ...prev, appId }))}
                />
              </div>

              <div className="tm-channel-config-field">
                <ChannelFormLabel required>{getAppSecretLabel(draft.platform, t)}</ChannelFormLabel>
                <SettingsInput
                  type="password"
                  value={appSecret}
                  placeholder={
                    draft.hasAppSecret
                      ? t('settings.channels.credentials.appSecretPlaceholderSaved')
                      : t('settings.channels.credentials.appSecretPlaceholder')
                  }
                  onChange={setAppSecret}
                />
              </div>

              <div className="tm-channel-config-grid-2">
                <div className="tm-channel-config-field">
                  <ChannelFormLabel>{t('settings.channels.credentials.encryptKey')}</ChannelFormLabel>
                  <SettingsInput
                    type="password"
                    value={encryptKey}
                    placeholder={
                      draft.hasEncryptKey
                        ? t('settings.channels.credentials.encryptKeyPlaceholderSaved')
                        : t('settings.channels.credentials.encryptKeyPlaceholder')
                    }
                    onChange={setEncryptKey}
                  />
                </div>

                <div className="tm-channel-config-field">
                  <ChannelFormLabel>{t('settings.channels.credentials.verificationToken')}</ChannelFormLabel>
                  <SettingsInput
                    type="password"
                    value={draft.verificationToken}
                    placeholder={t('settings.channels.credentials.verificationTokenPlaceholder')}
                    onChange={(verificationToken) => setDraft((prev) => ({ ...prev, verificationToken }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="tm-channel-config-grid-2">
            <div className="tm-channel-config-field">
              <ChannelFormLabel>{t('settings.channels.modal.domain')}</ChannelFormLabel>
              <SettingsInput
                value={draft.domain}
                placeholder={getDomainPlaceholder(draft.platform, t)}
                onChange={(domain) => setDraft((prev) => ({ ...prev, domain }))}
              />
            </div>

            <div className="tm-channel-config-field">
              <ChannelFormLabel>{t('settings.channels.modal.allowedChatIds')}</ChannelFormLabel>
              <SettingsInput
                value={draft.allowedChatIds}
                placeholder={t('settings.channels.modal.allowedChatIdsPlaceholder')}
                onChange={(allowedChatIds) => setDraft((prev) => ({ ...prev, allowedChatIds }))}
              />
            </div>
          </div>

          <p className="tm-channel-config-field-hint">{t('settings.channels.modal.allowedChatIdsHint')}</p>

          {testMessage ? <div className="tm-settings-error">{testMessage}</div> : null}
        </div>

        <footer className="tm-channel-config-footer">
          <div className="tm-channel-config-footer-actions">
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--secondary"
              onClick={onClose}
            >
              {t('settings.channels.modal.cancel')}
            </button>
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--secondary"
              disabled={testing}
              onClick={() => {
                setTesting(true)
                setTestMessage(null)
                void onTest(draft.platform)
                  .then((message) => {
                    if (message) setTestMessage(message)
                  })
                  .finally(() => setTesting(false))
              }}
            >
              {testing ? t('settings.channels.modal.testing') : t('settings.channels.modal.testConnection')}
            </button>
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--primary"
              onClick={() =>
                onSave({
                  ...draft,
                  ...(appSecret.trim() ? { appSecret: appSecret.trim() } : {}),
                  ...(encryptKey.trim() ? { encryptKey: encryptKey.trim() } : {}),
                })
              }
            >
              {t('settings.channels.modal.saveConfig')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
