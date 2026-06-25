import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider, type ProviderModel } from '@toolman/shared'
import { IconChevronRight, IconPlus, IconSearch, IconSliders } from '../../components/icons'
import { IconRefresh } from '../../components/nav-module-icons'
import { AddModelModal } from './AddModelModal'
import { ApiKeySettingsModal } from './ApiKeySettingsModal'
import { EditModelModal } from './EditModelModal'
import { ModelCapabilityTags } from './ModelCapabilityTags'
import { ModelPickerModal } from './ModelPickerModal'
import type { ProviderPreset } from './provider-presets'
import {
  displayBaseUrl,
  groupModels,
  isChatModelEntry,
  matchProviderToPreset,
  normalizeProviderBaseUrl,
  previewChatEndpoint,
} from './provider-model-utils'
import { useI18n } from '../../i18n/useI18n'
import { getProviderPresetDisplayName } from '../../i18n/settings-labels'
import { SettingsToggle } from './SettingsShared'

interface Props {
  workspaceId: string
  preset: ProviderPreset
  provider: Provider | null
  providers: Provider[]
  onChanged: () => void
}

function IconExternalLink({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function IconEye({ size = 16, hidden = false }: { size?: number; hidden?: boolean }) {
  if (hidden) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconMinus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconHelp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function ProviderConfigPanel({ workspaceId, preset, provider, providers, onChanged }: Props) {
  const { t } = useI18n()
  const presetName = getProviderPresetDisplayName(preset, t)
  const enabled = provider?.isEnabled ?? false
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageIsError, setMessageIsError] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerProvider, setPickerProvider] = useState<Provider | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ProviderModel | null>(null)
  const [apiKeySettingsOpen, setApiKeySettingsOpen] = useState(false)

  useEffect(() => {
    setBaseUrl(displayBaseUrl(preset.type, provider?.baseUrl ?? null, preset))
    setApiKey('')
    setMessage(null)
    setMessageIsError(false)
  }, [provider?.id, provider?.baseUrl, preset])

  const models = provider?.models ?? []
  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
  }, [models, modelQuery])

  const groupedModels = useMemo(() => groupModels(filteredModels), [filteredModels])
  const chatModelCount = models.filter((m) => isChatModelEntry(m)).length
  const previewUrl = previewChatEndpoint(preset.type, baseUrl, preset)

  const ensureProvider = useCallback(async (): Promise<Provider | null> => {
    if (provider) return provider

    const result = await window.api.invoke(IpcChannel.ProviderCreate, {
      workspaceId,
      name: preset.name,
      type: preset.type,
      baseUrl: normalizeProviderBaseUrl(preset.type, preset.defaultBaseUrl),
      presetId: preset.id,
    })
    if (!result.ok) {
      setMessage(result.error.message)
      return null
    }
    onChanged()
    return result.data as Provider
  }, [onChanged, preset, provider, workspaceId])

  const saveProvider = useCallback(
    async (patch: {
      isEnabled?: boolean
      baseUrl?: string
      apiKey?: string
      apiKeyRotate?: boolean
      models?: ProviderModel[]
    }) => {
      let current = provider
      if (!current) {
        current = await ensureProvider()
        if (!current) return null
      }

      const result = await window.api.invoke(IpcChannel.ProviderUpdate, {
        id: current.id,
        name: preset.name,
        type: preset.type,
        presetId: preset.id,
        ...(patch.isEnabled !== undefined ? { isEnabled: patch.isEnabled } : {}),
        ...(patch.baseUrl !== undefined
          ? { baseUrl: normalizeProviderBaseUrl(preset.type, patch.baseUrl) }
          : {}),
        ...(patch.apiKey !== undefined && patch.apiKey.trim() ? { apiKey: patch.apiKey.trim() } : {}),
        ...(patch.apiKeyRotate !== undefined ? { apiKeyRotate: patch.apiKeyRotate } : {}),
        ...(patch.models !== undefined ? { models: patch.models } : {}),
      })

      if (!result.ok) {
        setMessage(result.error.message)
        return null
      }

      onChanged()
      return result.data as Provider
    },
    [ensureProvider, onChanged, preset, provider],
  )

  const handleToggle = async (next: boolean) => {
    setBusy(true)
    setMessage(null)
    setMessageIsError(false)
    if (next) {
      await saveProvider({ isEnabled: true, baseUrl })
    } else if (provider) {
      await saveProvider({ isEnabled: false })
    }
    setBusy(false)
  }

  const handleBaseUrlBlur = async () => {
    if (!enabled || !provider) return
    const normalized = normalizeProviderBaseUrl(preset.type, baseUrl)
    if (normalized === provider.baseUrl) return
    setBusy(true)
    await saveProvider({ baseUrl })
    setBusy(false)
  }

  const handleTestKey = async () => {
    setBusy(true)
    setMessage(null)
    setMessageIsError(false)
    const current = provider ?? (await ensureProvider())
    if (!current) {
      setBusy(false)
      return
    }

    const result = await window.api.invoke(IpcChannel.ProviderTest, {
      id: current.id,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      baseUrl: normalizeProviderBaseUrl(preset.type, baseUrl),
    })
    setBusy(false)

    if (!result.ok) {
      setMessage(result.error.message)
      return
    }

    const data = result.data as { success: boolean; latencyMs: number; error?: string }
    if (data.success) {
      setMessage(t('settings.providers.test.success', { latencyMs: data.latencyMs }))
      setMessageIsError(false)
      if (apiKey.trim()) {
        await saveProvider({ apiKey: apiKey.trim(), baseUrl })
        setApiKey('')
      }
    } else {
      setMessage(
        t('settings.providers.test.failed', {
          error: data.error ?? t('settings.providers.test.unknownError'),
        }),
      )
      setMessageIsError(true)
    }
  }

  const openPicker = async () => {
    const current = provider ?? (await ensureProvider())
    if (!current) return

    if (apiKey.trim()) {
      await saveProvider({ apiKey: apiKey.trim(), baseUrl })
      setApiKey('')
    } else if (baseUrl !== displayBaseUrl(preset.type, current.baseUrl, preset)) {
      await saveProvider({ baseUrl })
    }

    setPickerProvider(current)
    setPickerOpen(true)
  }

  const handleSaveModels = async (nextModels: ProviderModel[]) => {
    setBusy(true)
    await saveProvider({ models: nextModels, isEnabled: true })
    setBusy(false)
    setMessage(t('settings.providers.models.updatedCount', { count: nextModels.length }))
    setMessageIsError(false)
  }

  const handleAddModel = async (model: ProviderModel) => {
    const current = provider ?? (await ensureProvider())
    if (!current) throw new Error(t('settings.providers.errors.createFailed'))
    if (current.models.some((m) => m.id === model.id)) {
      throw new Error(t('settings.providers.models.alreadyExists'))
    }
    await saveProvider({ models: [...current.models, model], isEnabled: true })
  }

  const handleEditModel = async (model: ProviderModel) => {
    if (!provider) return
    await saveProvider({
      models: provider.models.map((m) => (m.id === model.id ? model : m)),
    })
    setEditingModel(null)
    setMessage(t('settings.providers.models.settingsSaved'))
    setMessageIsError(false)
  }

  const handleRemoveModel = async (modelId: string) => {
    if (!provider) return
    setBusy(true)
    await saveProvider({
      models: provider.models.filter((m) => m.id !== modelId),
    })
    setBusy(false)
  }

  const handleApiKeySettingsSave = async (data: { apiKeys: string; apiKeyRotate: boolean }) => {
    await saveProvider({
      ...(data.apiKeys ? { apiKey: data.apiKeys } : {}),
      apiKeyRotate: data.apiKeyRotate,
    })
    setMessage(t('settings.providers.apiKey.settingsSaved'))
    setMessageIsError(false)
  }

  const handleDeleteProvider = async () => {
    if (!provider || preset.locked) return
    if (!window.confirm(t('settings.providers.remove.confirm', { name: presetName }))) return
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.ProviderDelete, { id: provider.id })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    onChanged()
  }

  const duplicate = providers.filter((item) => matchProviderToPreset(item, preset))
  const showDuplicateHint = duplicate.length > 1

  return (
    <>
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
                          group.items.map((model) => (
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

            <footer className="tm-provider-footer">
              <span>
                {t('settings.providers.footer.view')}{' '}
                <button type="button" className="tm-provider-link" onClick={() => openExternal(preset.docUrl)}>
                  {t('settings.providers.footer.providerDocs', { name: presetName })}
                </button>{' '}
                {t('settings.providers.footer.and')}{' '}
                <button
                  type="button"
                  className="tm-provider-link"
                  onClick={() => openExternal(preset.modelsDocUrl)}
                >
                  {t('settings.providers.footer.modelsLink')}
                </button>{' '}
                {t('settings.providers.footer.moreDetails')}
              </span>
              {!preset.locked && provider && (
                <button
                  type="button"
                  className="tm-provider-link tm-provider-link--danger"
                  disabled={busy}
                  onClick={() => void handleDeleteProvider()}
                >
                  {t('settings.providers.remove.action')}
                </button>
              )}
            </footer>
          </div>
        )}
      </div>

      {pickerOpen && pickerProvider && (
        <ModelPickerModal
          provider={pickerProvider}
          preset={preset}
          installedModels={models}
          onClose={() => {
            setPickerOpen(false)
            setPickerProvider(null)
          }}
          onSave={handleSaveModels}
        />
      )}

      {addOpen && (
        <AddModelModal presetId={preset.id} onClose={() => setAddOpen(false)} onAdd={handleAddModel} />
      )}

      {editingModel && (
        <EditModelModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSave={handleEditModel}
        />
      )}

      {apiKeySettingsOpen && (
        <ApiKeySettingsModal
          hasApiKey={provider?.hasApiKey ?? false}
          apiKeyRotate={provider?.apiKeyRotate ?? false}
          onClose={() => setApiKeySettingsOpen(false)}
          onSave={handleApiKeySettingsSave}
        />
      )}
    </>
  )
}
