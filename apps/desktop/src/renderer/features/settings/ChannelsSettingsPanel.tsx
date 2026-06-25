import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CHANNEL_PLATFORMS,
  IpcChannel,
  type Assistant,
  type ChannelPlatformId,
  type ChannelRuntimeStatus,
  type ImChannelConfigPublic,
} from '@toolman/shared'
import { IconCopy } from '../../components/icons'
import { getChannelPlatformLabel, getChannelStatusLabel, resolveChannelDisplayName } from '../../i18n/settings-labels'
import { useI18n } from '../../i18n/useI18n'
import type { TranslateFn } from '../../i18n/useI18n'
import {
  clearLegacyChannelConfigs,
  loadLegacyChannelConfigs,
} from './channel-settings'
import {
  SettingsInput,
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
} from './SettingsShared'

interface ModalProps {
  config: ImChannelConfigPublic
  assistants: Assistant[]
  webhookPath: string
  onClose: () => void
  onSave: (config: Partial<ImChannelConfigPublic> & { platform: ChannelPlatformId; appSecret?: string; encryptKey?: string }) => void
  onTest: (platform: ChannelPlatformId) => Promise<string | null>
}

function ChannelFormLabel({
  children,
  required,
  htmlFor,
}: {
  children: ReactNode
  required?: boolean
  htmlFor?: string
}) {
  return (
    <label className="tm-channel-config-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="tm-channel-config-required">*</span> : null}
    </label>
  )
}

function hasWebhookUrl(platform: ChannelPlatformId): boolean {
  return platform === 'feishu' || platform === 'wechat'
}

function getEnableDescription(
  platform: ChannelPlatformId,
  platformName: string,
  t: TranslateFn,
): string {
  const key = `settings.channels.enable.${platform}` as const
  const translated = t(key)
  if (translated !== key) return translated
  return t('settings.channels.enable.default', { platform: platformName })
}

function getConnectionHint(platform: ChannelPlatformId, t: TranslateFn): string | null {
  const key = `settings.channels.hints.${platform}` as const
  const translated = t(key)
  if (translated !== key) return translated
  return t('settings.channels.hints.default')
}

function getAppSecretLabel(platform: ChannelPlatformId, t: TranslateFn): string {
  switch (platform) {
    case 'discord':
      return t('settings.channels.credentials.appSecretDiscord')
    case 'dingtalk':
      return t('settings.channels.credentials.appSecretDingtalk')
    case 'wechat':
      return t('settings.channels.credentials.appSecretWechat')
    default:
      return t('settings.channels.credentials.appSecretDefault')
  }
}

function getDomainPlaceholder(platform: ChannelPlatformId, t: TranslateFn): string {
  switch (platform) {
    case 'feishu':
      return t('settings.channels.modal.domainFeishu')
    case 'wechat':
      return t('settings.channels.modal.domainWechat')
    default:
      return t('settings.channels.modal.domainDefault')
  }
}

function ChannelConfigModal({
  config,
  assistants,
  webhookPath,
  onClose,
  onSave,
  onTest,
}: ModalProps) {
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

interface Props {
  workspaceId: string | null
}

export function ChannelsSettingsPanel({ workspaceId }: Props) {
  const { t } = useI18n()
  const [configs, setConfigs] = useState<ImChannelConfigPublic[]>([])
  const [statuses, setStatuses] = useState<Record<string, ChannelRuntimeStatus>>({})
  const [statusMessages, setStatusMessages] = useState<Record<string, string | undefined>>({})
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('')
  const [webhookPaths, setWebhookPaths] = useState<Record<string, string>>({})
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [editingPlatform, setEditingPlatform] = useState<ChannelPlatformId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadChannels = useCallback(async () => {
    setLoading(true)
    const [listResult, statusResult, webhookResult] = await Promise.all([
      window.api.invoke(IpcChannel.ImChannelList, {}),
      window.api.invoke(IpcChannel.ImChannelStatusList, {}),
      window.api.invoke(IpcChannel.ImChannelWebhookInfo, {}),
    ])
    setLoading(false)

    if (!listResult.ok) {
      setError(listResult.error.message)
      return
    }

    const listData = listResult.data as {
      webhookBaseUrl: string
      items: ImChannelConfigPublic[]
    }
    setConfigs(listData.items)
    setWebhookBaseUrl(listData.webhookBaseUrl)

    if (statusResult.ok) {
      const statusData = statusResult.data as {
        items: Array<{
          platform: ChannelPlatformId
          status: ChannelRuntimeStatus
          message?: string
        }>
      }
      setStatuses(Object.fromEntries(statusData.items.map((item) => [item.platform, item.status])))
      setStatusMessages(Object.fromEntries(statusData.items.map((item) => [item.platform, item.message])))
    }

    if (webhookResult.ok) {
      const webhookData = webhookResult.data as { paths: Record<string, string> }
      setWebhookPaths(webhookData.paths)
    }

    setError(null)
  }, [])

  useEffect(() => {
    void (async () => {
      const legacy = loadLegacyChannelConfigs()
      for (const item of legacy) {
        await window.api.invoke(IpcChannel.ImChannelUpsert, item)
      }
      if (legacy.length > 0) clearLegacyChannelConfigs()
      await loadChannels()
    })()
  }, [loadChannels])

  useEffect(() => {
    if (!workspaceId) return
    void (async () => {
      const result = await window.api.invoke(IpcChannel.AssistantList, { workspaceId })
      if (result.ok) {
        setAssistants(result.data as Assistant[])
      }
    })()
  }, [workspaceId])

  const configMap = useMemo(
    () => Object.fromEntries(configs.map((item) => [item.platform, item])),
    [configs],
  )

  const editingConfig = editingPlatform ? configMap[editingPlatform] : null

  const handleSave = async (
    config: Partial<ImChannelConfigPublic> & {
      platform: ChannelPlatformId
      appSecret?: string
      encryptKey?: string
    },
  ) => {
    const result = await window.api.invoke(IpcChannel.ImChannelUpsert, config)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setEditingPlatform(null)
    await loadChannels()
  }

  const handleTest = async (platform: ChannelPlatformId): Promise<string | null> => {
    const result = await window.api.invoke(IpcChannel.ImChannelTest, { platform })
    if (!result.ok) return result.error.message
    const data = result.data as { ok: boolean; message: string }
    return data.ok ? data.message : data.message
  }

  return (
    <SettingsPageLayout>
      {error ? <div className="tm-settings-error">{error}</div> : null}
      {loading ? <div className="tm-settings-loading">{t('common.loading')}</div> : null}

      <SettingsSection title={t('settings.channels.title')} intro={t('settings.channels.intro')}>
        <div className="tm-channel-webhook-hint">
          {t('settings.channels.webhookBase')}<code>{webhookBaseUrl || '—'}</code>
        </div>

        {CHANNEL_PLATFORMS.map((platform) => {
          const config = configMap[platform.id]
          const enabled = config?.enabled ?? false
          const status = statuses[platform.id] ?? 'stopped'
          const statusMessage = statusMessages[platform.id]
          const statusLabel = getChannelStatusLabel(status, t)
          const platformLabel = getChannelPlatformLabel(platform.id, t)
          const channelDisplayName = config
            ? resolveChannelDisplayName(platform.id, config.name, t)
            : platformLabel
          return (
            <SettingsRow
              key={platform.id}
              label={platformLabel}
              hint={
                enabled
                  ? `${channelDisplayName} · ${statusLabel}${statusMessage ? ` · ${statusMessage}` : ''}`
                  : t('settings.channels.notConfigured')
              }
            >
              <div className="tm-channel-row-actions">
                <span className={`tm-channel-status tm-channel-status--${status}`}>
                  {statusLabel}
                </span>
                <SettingsToggle
                  checked={enabled}
                  onChange={() => setEditingPlatform(platform.id)}
                />
              </div>
            </SettingsRow>
          )
        })}
      </SettingsSection>

      {editingConfig && editingPlatform && (
        <ChannelConfigModal
          config={editingConfig}
          assistants={assistants}
          webhookPath={webhookPaths[editingPlatform] ?? `${webhookBaseUrl}/${editingPlatform}/events`}
          onClose={() => setEditingPlatform(null)}
          onSave={(config) => void handleSave(config)}
          onTest={async (platform) => {
            const message = await handleTest(platform)
            return message
          }}
        />
      )}
    </SettingsPageLayout>
  )
}
