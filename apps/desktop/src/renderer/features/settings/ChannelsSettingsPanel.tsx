import { useI18n } from '../../i18n/useI18n'
import { getChannelPlatformLabel, getChannelStatusLabel, resolveChannelDisplayName } from '../../i18n/settings-labels'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from './SettingsShared'
import { ChannelConfigModal } from './ChannelConfigModal'
import { useChannelsSettingsPanel } from './useChannelsSettingsPanel'

interface Props {
  workspaceId: string | null
}

export function ChannelsSettingsPanel({ workspaceId }: Props) {
  const { t } = useI18n()
  const {
    statuses,
    statusMessages,
    webhookBaseUrl,
    webhookPaths,
    assistants,
    editingPlatform,
    setEditingPlatform,
    error,
    loading,
    configMap,
    editingConfig,
    handleSave,
    handleTest,
    platforms,
  } = useChannelsSettingsPanel(workspaceId)

  return (
    <SettingsPageLayout>
      {error ? <div className="tm-settings-error">{error}</div> : null}
      {loading ? <div className="tm-settings-loading">{t('common.loading')}</div> : null}

      <SettingsSection title={t('settings.channels.title')} intro={t('settings.channels.intro')}>
        <div className="tm-channel-webhook-hint">
          {t('settings.channels.webhookBase')}<code>{webhookBaseUrl || '—'}</code>
        </div>

        {platforms.map((platform) => {
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

      {editingConfig && editingPlatform ? (
        <ChannelConfigModal
          config={editingConfig}
          assistants={assistants}
          webhookPath={webhookPaths[editingPlatform] ?? `${webhookBaseUrl}/${editingPlatform}/events`}
          onClose={() => setEditingPlatform(null)}
          onSave={(config) => void handleSave(config)}
          onTest={handleTest}
        />
      ) : null}
    </SettingsPageLayout>
  )
}
