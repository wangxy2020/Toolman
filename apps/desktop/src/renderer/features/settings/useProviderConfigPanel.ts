import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider, type ProviderModel } from '@toolman/shared'
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

interface UseProviderConfigPanelOptions {
  workspaceId: string
  preset: ProviderPreset
  provider: Provider | null
  providers: Provider[]
  onChanged: () => void
}

export function useProviderConfigPanel({
  workspaceId,
  preset,
  provider,
  providers,
  onChanged,
}: UseProviderConfigPanelOptions) {
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
  const duplicate = providers.filter((item) => matchProviderToPreset(item, preset))
  const showDuplicateHint = duplicate.length > 1

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

  return {
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
    pickerOpen,
    setPickerOpen,
    pickerProvider,
    setPickerProvider,
    addOpen,
    setAddOpen,
    editingModel,
    setEditingModel,
    apiKeySettingsOpen,
    setApiKeySettingsOpen,
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
    handleSaveModels,
    handleAddModel,
    handleEditModel,
    handleRemoveModel,
    handleApiKeySettingsSave,
    handleDeleteProvider,
  }
}
