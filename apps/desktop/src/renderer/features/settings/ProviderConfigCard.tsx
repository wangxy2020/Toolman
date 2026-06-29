import type { Provider, ProviderModel } from '@toolman/shared'
import { IconChevronRight, IconPlus, IconSearch, IconSliders } from '../../components/icons'
import { IconRefresh } from '../../components/nav-module-icons'
import type { ProviderPreset } from './provider-presets'
import { ModelCapabilityTags } from './ModelCapabilityTags'
import { useI18n } from '../../i18n/useI18n'
import { SettingsToggle } from './SettingsShared'
import {
  IconExternalLink,
  IconEye,
  IconHelp,
  IconMinus,
  openExternal,
} from './provider-config-icons'
import type { useProviderConfigPanel } from './useProviderConfigPanel'
import { ProviderConfigCardFooter } from './ProviderConfigCardFooter'

type PanelState = ReturnType<typeof useProviderConfigPanel>

interface Props {
  preset: ProviderPreset
  provider: Provider | null
  panel: PanelState
}

export function ProviderConfigCard({ preset, provider, panel }: Props) {
  const { t } = useI18n()
  const {
    presetName,
    enabled,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    showKey,
    setShowKey,
    busy,
    message,
    messageIsError,
    modelQuery,
    setModelQuery,
    collapsedGroups,
    setCollapsedGroups,
    models,
    groupedModels,
    chatModelCount,
    previewUrl,
    showDuplicateHint,
    ensureProvider,
    handleToggle,
    handleBaseUrlBlur,
    handleTestKey,
    openPicker,
    setAddOpen,
    setEditingModel,
    setApiKeySettingsOpen,
    handleRemoveModel,
    handleDeleteProvider,
  } = panel

  return (
    <div className={`tm-provider-card ${enabled ? 'tm-provider-card--on' : ''}`}>
      <header className="tm-provider-card-header">
        <div className="tm-provider-card-title-wrap">
          <h4 className="tm-provider-card-title">
            {presetName}
            <button
              type="button"
              className="tm-provider-icon-btn"
              title={t('settings.providers.openDocs')}
              onClick={() => openExternal(preset.docUrl)}
            >
              <IconExternalLink />
            </button>
          </h4>
        </div>
        <SettingsToggle checked={enabled} onChange={(v) => void handleToggle(v)} />
      </header>

      {showDuplicateHint && (
        <p className="tm-provider-hint tm-provider-hint--warn">{t('settings.providers.duplicateHint')}</p>
      )}

      {enabled && (
        <div className="tm-provider-card-body">
          {!preset.isLocal && (
            <div className="tm-provider-field">
              <div className="tm-provider-field-label tm-provider-field-label--split">
                <span>{t('settings.providers.apiKey.label')}</span>
                <button
                  type="button"
                  className="tm-provider-icon-btn"
                  title={t('settings.providers.apiKey.settingsTitle')}
                  onClick={() => setApiKeySettingsOpen(true)}
                >
                  <IconSliders size={14} />
                </button>
              </div>
              <div className="tm-provider-field-control">
                <div className="tm-provider-input-wrap">
                  <input
                    className="tm-provider-input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    placeholder={
                      provider?.hasApiKey
                        ? t('settings.providers.apiKey.placeholderConfigured')
                        : t('settings.providers.apiKey.placeholder')
                    }
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    className="tm-provider-input-action"
                    title={showKey ? t('settings.providers.apiKey.hide') : t('settings.providers.apiKey.show')}
                    onClick={() => setShowKey((v) => !v)}
                  >
                    <IconEye hidden={showKey} />
                  </button>
                  <button
                    type="button"
                    className="tm-provider-detect-btn"
                    disabled={busy}
                    onClick={() => void handleTestKey()}
                  >
                    {t('settings.providers.apiKey.test')}
                  </button>
                </div>
                <div className="tm-provider-field-footer">
                  {preset.apiKeyUrl ? (
                    <button
                      type="button"
                      className="tm-provider-field-link"
                      onClick={() => openExternal(preset.apiKeyUrl!)}
                    >
                      {t('settings.providers.apiKey.getKeyLink')}
                    </button>
                  ) : (
                    <span />
                  )}
                  <span className="tm-provider-field-hint">{t('settings.providers.apiKey.multiKeyHint')}</span>
                </div>
              </div>
            </div>
          )}

          <div className="tm-provider-field">
            <div className="tm-provider-field-label">
              <span>{t('settings.providers.baseUrl.label')}</span>
              <button type="button" className="tm-provider-icon-btn" title={t('settings.providers.baseUrl.help')}>
                <IconHelp />
              </button>
            </div>
            <div className="tm-provider-field-control">
              <input
                className="tm-provider-input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => void handleBaseUrlBlur()}
                placeholder={preset.defaultBaseUrl}
              />
              <p className="tm-provider-field-hint">
                {t('settings.providers.baseUrl.preview', { url: previewUrl })}
              </p>
            </div>
          </div>

          <div className="tm-provider-models">
            <div className="tm-provider-models-header">
              <div className="tm-provider-models-title">
                <span>{t('settings.providers.models.label')}</span>
                <span className="tm-provider-models-count">{chatModelCount || models.length}</span>
              </div>
              <div className="tm-provider-models-actions">
                <button
                  type="button"
                  className="tm-provider-fetch-btn"
                  disabled={busy}
                  onClick={() => void openPicker()}
                >
                  <IconRefresh size={14} />
                  {t('settings.providers.models.fetchList')}
                </button>
                <button
                  type="button"
                  className="tm-provider-add-btn"
                  disabled={busy}
                  title={t('settings.providers.models.addManualTitle')}
                  onClick={() => void (async () => {
                    const current = provider ?? (await ensureProvider())
                    if (current) setAddOpen(true)
                  })()}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            </div>

            <div className="tm-provider-model-search">
              <IconSearch size={14} />
              <input
                className="tm-provider-input tm-provider-input--compact"
                value={modelQuery}
                placeholder={t('settings.providers.models.searchPlaceholder')}
                onChange={(e) => setModelQuery(e.target.value)}
              />
            </div>

            {groupedModels.length === 0 ? (
              <p className="tm-provider-empty">{t('settings.providers.models.empty')}</p>
            ) : (
              <div className="tm-provider-model-groups">
                {groupedModels.map((group) => {
                  const collapsed = collapsedGroups[group.key] ?? false
                  return (
                    <div key={group.key} className="tm-provider-model-group">
                      <button
                        type="button"
                        className="tm-provider-model-group-header"
                        onClick={() =>
                          setCollapsedGroups((prev) => ({ ...prev, [group.key]: !collapsed }))
                        }
                      >
                        <IconChevronRight size={14} open={!collapsed} />
                        <span>{group.key}</span>
                      </button>
                      {!collapsed &&
                        group.items.map((model: ProviderModel) => (
                          <div key={model.id} className="tm-provider-model-item">
                            <div className="tm-provider-model-item-main">
                              <span className="tm-provider-model-icon" aria-hidden />
                              <span className="tm-provider-model-name">{model.name}</span>
                              <ModelCapabilityTags model={model} />
                            </div>
                            <div className="tm-provider-model-item-actions">
                              <button
                                type="button"
                                className="tm-provider-icon-btn"
                                title={t('settings.providers.models.editTitle')}
                                disabled={busy}
                                onClick={() => setEditingModel(model)}
                              >
                                <IconSliders size={14} />
                              </button>
                              <button
                                type="button"
                                className="tm-provider-icon-btn tm-provider-icon-btn--danger"
                                title={t('settings.providers.models.removeTitle')}
                                disabled={busy}
                                onClick={() => void handleRemoveModel(model.id)}
                              >
                                <IconMinus />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {message && (
            <p
              className={`tm-provider-message ${messageIsError ? 'tm-provider-message--error' : ''}`}
            >
              {message}
            </p>
          )}

          <ProviderConfigCardFooter
            t={t}
            preset={preset}
            presetName={presetName}
            provider={provider}
            busy={busy}
            onDeleteProvider={handleDeleteProvider}
          />
        </div>
      )}
    </div>
  )
}
