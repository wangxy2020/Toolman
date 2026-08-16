import { useCallback } from 'react'
import { IpcChannel, type Provider, type ProviderModel } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import type { ProviderPreset } from './provider-presets'
import { displayBaseUrl } from './provider-model-utils'

interface ModelHandlersOptions {
  provider: Provider | null
  setBusy: (value: boolean) => void
  setMessage: (value: string | null) => void
  setMessageIsError: (value: boolean) => void
  setEditingModel: (value: ProviderModel | null) => void
  t: TranslateFn
  ensureProvider: () => Promise<Provider | null>
  saveProvider: (patch: {
    isEnabled?: boolean
    baseUrl?: string
    apiKey?: string
    apiKeyRotate?: boolean
    models?: ProviderModel[]
  }) => Promise<Provider | null>
}

export function useProviderConfigPanelModels({
  provider,
  setBusy,
  setMessage,
  setMessageIsError,
  setEditingModel,
  t,
  ensureProvider,
  saveProvider,
}: ModelHandlersOptions) {
  const handleSaveModels = useCallback(
    async (nextModels: ProviderModel[]) => {
      setBusy(true)
      await saveProvider({ models: nextModels, isEnabled: true })
      setBusy(false)
      setMessage(t('settings.providers.models.updatedCount', { count: nextModels.length }))
      setMessageIsError(false)
    },
    [saveProvider, setBusy, setMessage, setMessageIsError, t],
  )

  const handleAddModel = useCallback(
    async (model: ProviderModel) => {
      const current = provider ?? (await ensureProvider())
      if (!current) throw new Error(t('settings.providers.errors.createFailed'))
      if (current.models.some((m) => m.id === model.id)) {
        throw new Error(t('settings.providers.models.alreadyExists'))
      }
      await saveProvider({ models: [...current.models, model], isEnabled: true })
    },
    [ensureProvider, provider, saveProvider, t],
  )

  const handleEditModel = useCallback(
    async (model: ProviderModel) => {
      if (!provider) return
      await saveProvider({
        models: provider.models.map((m) => (m.id === model.id ? model : m)),
      })
      setEditingModel(null)
      setMessage(t('settings.providers.models.settingsSaved'))
      setMessageIsError(false)
    },
    [provider, saveProvider, setEditingModel, setMessage, setMessageIsError, t],
  )

  const handleRemoveModel = useCallback(
    async (modelId: string) => {
      if (!provider) return
      setBusy(true)
      await saveProvider({
        models: provider.models.filter((m) => m.id !== modelId),
      })
      setBusy(false)
    },
    [provider, saveProvider, setBusy],
  )

  const handleApiKeySettingsSave = useCallback(
    async (data: { apiKeys: string; apiKeyRotate: boolean }) => {
      await saveProvider({
        ...(data.apiKeys ? { apiKey: data.apiKeys } : {}),
        apiKeyRotate: data.apiKeyRotate,
      })
      setMessage(t('settings.providers.apiKey.settingsSaved'))
      setMessageIsError(false)
    },
    [saveProvider, setMessage, setMessageIsError, t],
  )

  return {
    handleSaveModels,
    handleAddModel,
    handleEditModel,
    handleRemoveModel,
    handleApiKeySettingsSave,
  }
}

export async function revealStoredApiKey(options: {
  apiKey: string
  provider: Provider | null
  setApiKey: (value: string) => void
  setMessage: (value: string | null) => void
  setMessageIsError: (value: boolean) => void
  t: TranslateFn
}): Promise<string | null> {
  const { apiKey, provider, setApiKey, setMessage, setMessageIsError, t } = options
  if (apiKey.trim()) return apiKey.trim()
  if (!provider?.hasApiKey) return ''
  const result = await window.api.invoke(IpcChannel.ProviderRevealApiKey, { id: provider.id })
  if (!result.ok) {
    setMessage(result.error.message || t('settings.providers.apiKey.revealFailed'))
    setMessageIsError(true)
    return null
  }
  const key = (result.data as { apiKey: string }).apiKey
  setApiKey(key)
  return key
}

export async function openProviderModelPicker(options: {
  provider: Provider | null
  apiKey: string
  baseUrl: string
  preset: ProviderPreset
  ensureProvider: () => Promise<Provider | null>
  saveProvider: (patch: { apiKey?: string; baseUrl?: string }) => Promise<Provider | null>
  setPickerProvider: (provider: Provider | null) => void
  setPickerOpen: (open: boolean) => void
}): Promise<void> {
  const {
    provider,
    apiKey,
    baseUrl,
    preset,
    ensureProvider,
    saveProvider,
    setPickerProvider,
    setPickerOpen,
  } = options
  const current = provider ?? (await ensureProvider())
  if (!current) return

  if (apiKey.trim()) {
    await saveProvider({ apiKey: apiKey.trim(), baseUrl })
  } else if (baseUrl !== displayBaseUrl(preset.type, current.baseUrl, preset)) {
    await saveProvider({ baseUrl })
  }

  setPickerProvider(current)
  setPickerOpen(true)
}
