import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type Provider } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import {
  MODEL_GUIDE_RECOMMENDATIONS,
  OLLAMA_DOWNLOAD_URL,
  modelGuideStatusMatches,
  resolveDefaultChatGuide,
  type ModelGuideStatus,
} from './model-equipment-guide.constants'
import { NETWORK_PROVIDER_PRESETS, OLLAMA_PRESET } from './provider-presets'
import {
  isChatModelEntry,
  isDeepSeekSupportedModelId,
  matchProviderToPreset,
  normalizeDeepSeekModelId,
  readProviderPresetId,
} from './provider-model-utils'
import { SettingsRow } from './SettingsShared'

interface Props {
  workspaceId: string | null
}

function findOllamaProvider(providers: Provider[]): Provider | null {
  const byPreset = providers.find((provider) => readProviderPresetId(provider) === OLLAMA_PRESET.id)
  if (byPreset) return byPreset
  return providers.find((provider) => matchProviderToPreset(provider, OLLAMA_PRESET)) ?? null
}

const DEEPSEEK_PRESET = NETWORK_PROVIDER_PRESETS.find((preset) => preset.id === 'deepseek')!

function findDeepseekProvider(providers: Provider[]): Provider | null {
  const byPreset = providers.find((provider) => readProviderPresetId(provider) === 'deepseek')
  if (byPreset) return byPreset
  return providers.find((provider) => matchProviderToPreset(provider, DEEPSEEK_PRESET)) ?? null
}

function isDeepseekChatReady(provider: Provider | null): boolean {
  if (!provider?.isEnabled || !provider.hasApiKey) return false
  return provider.models.some((model) => {
    const id = normalizeDeepSeekModelId(model.id)
    return isDeepSeekSupportedModelId(id) && isChatModelEntry(model)
  })
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function ModelInstallButton({
  ready,
  busy,
  disabled,
  onInstall,
}: {
  ready: boolean
  busy?: boolean
  disabled?: boolean
  onInstall: () => void
}) {
  const { t } = useI18n()

  if (ready) {
    return (
      <button
        type="button"
        className="tm-model-equipment-install-btn tm-model-equipment-install-btn--installed"
        disabled
      >
        {t('settings.general.modelEquipment.installed')}
      </button>
    )
  }

  return (
    <button
      type="button"
      className="tm-model-equipment-install-btn"
      disabled={disabled || busy}
      onClick={onInstall}
    >
      {busy
        ? t('settings.general.modelEquipment.installing')
        : t('settings.general.modelEquipment.install')}
    </button>
  )
}

export function GeneralModelEquipmentPanel({ workspaceId }: Props) {
  const { language, t } = useI18n()
  const [providers, setProviders] = useState<Provider[]>([])
  const [ollamaOnline, setOllamaOnline] = useState<ModelGuideStatus>('idle')
  const [installedModelIds, setInstalledModelIds] = useState<string[]>([])
  const [pullingModelId, setPullingModelId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const loadProviders = useCallback(async () => {
    if (!workspaceId) {
      setProviders([])
      return
    }

    const result = await window.api.invoke(IpcChannel.ProviderList, { workspaceId })
    if (result.ok) {
      setProviders(result.data as Provider[])
    }
  }, [workspaceId])

  useEffect(() => {
    mountedRef.current = true
    void loadProviders()
    return () => {
      mountedRef.current = false
    }
  }, [loadProviders])

  const ollamaProvider = useMemo(() => findOllamaProvider(providers), [providers])
  const deepseekProvider = useMemo(() => findDeepseekProvider(providers), [providers])
  const defaultChatGuide = resolveDefaultChatGuide(language)

  const refreshOllamaModels = useCallback(async (): Promise<string[]> => {
    if (!ollamaProvider) return []

    const fetched = await window.api.invoke(IpcChannel.ProviderFetchModels, {
      id: ollamaProvider.id,
      persist: true,
    })
    if (!fetched.ok) {
      return ollamaProvider.models.map((model) => model.id)
    }

    const models = (fetched.data as { models: Provider['models'] }).models
    return models.map((model) => model.id)
  }, [ollamaProvider])

  const refreshStatus = useCallback(async () => {
    if (!mountedRef.current) return

    if (!ollamaProvider) {
      setOllamaOnline((prev) => (prev === 'missing' ? prev : 'missing'))
      setInstalledModelIds((prev) => (prev.length === 0 ? prev : []))
      void loadProviders()
      return
    }

    const testResult = await window.api.invoke(IpcChannel.ProviderTest, { id: ollamaProvider.id })
    if (!mountedRef.current) return

    const nextOnline: ModelGuideStatus = testResult.ok ? 'ready' : 'missing'
    setOllamaOnline((prev) => (prev === nextOnline ? prev : nextOnline))

    if (!testResult.ok) {
      setInstalledModelIds((prev) => (prev.length === 0 ? prev : []))
      void loadProviders()
      return
    }

    const modelIds = await refreshOllamaModels()
    if (!mountedRef.current) return

    setInstalledModelIds((prev) => {
      if (prev.length === modelIds.length && prev.every((id, index) => id === modelIds[index])) {
        return prev
      }
      return modelIds
    })
    void loadProviders()
  }, [loadProviders, ollamaProvider, refreshOllamaModels])

  useEffect(() => {
    if (!workspaceId || !ollamaProvider) return
    void refreshStatus()
  }, [ollamaProvider?.id, refreshStatus, workspaceId])

  useEffect(() => {
    if (ollamaOnline === 'ready') return
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [ollamaOnline, refreshStatus])

  const pullModel = useCallback(
    async (modelId: string) => {
      if (!ollamaProvider) {
        setErrorMessage(t('settings.general.modelEquipment.messages.ollamaOffline'))
        return
      }

      setErrorMessage(null)
      setPullingModelId(modelId)

      try {
        const result = await window.api.invoke(IpcChannel.ProviderPullModel, {
          id: ollamaProvider.id,
          modelId,
        })
        if (!result.ok) {
          setErrorMessage(result.error.message)
          return
        }
        await refreshStatus()
      } finally {
        if (mountedRef.current) {
          setPullingModelId(null)
        }
      }
    },
    [ollamaProvider, refreshStatus, t],
  )

  const ollamaReady = ollamaOnline === 'ready'

  const chatReady =
    defaultChatGuide.kind === 'ollama'
      ? ollamaReady &&
        modelGuideStatusMatches(installedModelIds, defaultChatGuide.modelId)
      : isDeepseekChatReady(deepseekProvider)
  const embeddingReady =
    ollamaReady &&
    modelGuideStatusMatches(installedModelIds, MODEL_GUIDE_RECOMMENDATIONS.embedding.modelId)
  const ocrReady =
    ollamaReady && modelGuideStatusMatches(installedModelIds, MODEL_GUIDE_RECOMMENDATIONS.ocr.modelId)

  const modelsLocked = !ollamaReady || !ollamaProvider
  const defaultChatModelId = defaultChatGuide.kind === 'ollama' ? defaultChatGuide.modelId : null
  const defaultChatLocked = defaultChatGuide.kind === 'ollama' ? modelsLocked : false

  const installDefaultChat = () => {
    if (defaultChatGuide.kind === 'ollama') {
      void pullModel(defaultChatGuide.modelId)
      return
    }
    openExternal(defaultChatGuide.installUrl)
  }

  return (
    <>
      {errorMessage ? <p className="tm-model-equipment-error">{errorMessage}</p> : null}

      <SettingsRow label={t('settings.general.modelEquipment.ollama')} hint={t('settings.general.modelEquipment.ollamaHint')}>
        <ModelInstallButton
          ready={ollamaReady}
          onInstall={() => openExternal(OLLAMA_DOWNLOAD_URL)}
        />
      </SettingsRow>

      <SettingsRow
        label={t('settings.general.modelEquipment.embedding')}
        hint={t('settings.general.modelEquipment.embeddingHint')}
      >
        <ModelInstallButton
          ready={embeddingReady}
          busy={pullingModelId === MODEL_GUIDE_RECOMMENDATIONS.embedding.modelId}
          disabled={modelsLocked}
          onInstall={() => void pullModel(MODEL_GUIDE_RECOMMENDATIONS.embedding.modelId)}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.general.modelEquipment.ocr')} hint={t('settings.general.modelEquipment.ocrHint')}>
        <ModelInstallButton
          ready={ocrReady}
          busy={pullingModelId === MODEL_GUIDE_RECOMMENDATIONS.ocr.modelId}
          disabled={modelsLocked}
          onInstall={() => void pullModel(MODEL_GUIDE_RECOMMENDATIONS.ocr.modelId)}
        />
      </SettingsRow>

      <SettingsRow
        label={t('settings.general.modelEquipment.defaultModel')}
        hint={t('settings.general.modelEquipment.defaultModelHint')}
      >
        <ModelInstallButton
          ready={chatReady}
          busy={defaultChatModelId !== null && pullingModelId === defaultChatModelId}
          disabled={defaultChatLocked}
          onInstall={installDefaultChat}
        />
      </SettingsRow>
    </>
  )
}
