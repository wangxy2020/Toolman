import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider } from '@toolman/shared'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { ProviderConfigPanel } from './ProviderConfigPanel'
import {
  listEnabledModels,
  matchProviderToPreset,
  readProviderPresetId,
} from './provider-model-utils'
import {
  NETWORK_PROVIDER_PRESETS,
  OLLAMA_PRESET,
  type ProviderPreset,
} from './provider-presets'
import { SettingsSection } from './SettingsShared'

interface Props {
  workspaceId: string
  onSaved?: () => void
}

function findProviderForPreset(providers: Provider[], preset: ProviderPreset): Provider | null {
  const byPreset = providers.find((p) => readProviderPresetId(p) === preset.id)
  if (byPreset) return byPreset
  return providers.find((p) => matchProviderToPreset(p, preset)) ?? null
}

export function ModelServicePanel({ workspaceId, onSaved }: Props) {
  const { t } = useI18n()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const result = await window.api.invoke(IpcChannel.ProviderList, { workspaceId })
    if (result.ok) {
      setProviders(result.data as Provider[])
    }
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const handleChanged = useCallback(async () => {
    await load()
    onSaved?.()
  }, [load, onSaved])

  const enabledModels = useMemo(() => listEnabledModels(providers), [providers])
  const chatModels = enabledModels.filter((m) => m.isChat)
  const embeddingModels = enabledModels.filter((m) => m.isEmbedding)
  const rerankModels = enabledModels.filter((m) => m.isRerank)
  const ollamaProvider = findProviderForPreset(providers, OLLAMA_PRESET)

  const customNetworkProviders = providers.filter((provider) => {
    if (provider.type === 'ollama') return false
    const presetId = readProviderPresetId(provider)
    if (presetId && NETWORK_PROVIDER_PRESETS.some((p) => p.id === presetId)) return false
    return !NETWORK_PROVIDER_PRESETS.some((preset) => matchProviderToPreset(provider, preset))
  })

  const handleAddCustomProvider = async () => {
    const name = window.prompt(
      t('settings.modelService.promptProviderName'),
      t('settings.modelService.promptProviderNameDefault'),
    )
    if (!name?.trim()) return
    const baseUrl = window.prompt(
      t('settings.modelService.promptBaseUrl'),
      t('settings.modelService.promptBaseUrlDefault'),
    )
    if (!baseUrl?.trim()) return

    const result = await window.api.invoke(IpcChannel.ProviderCreate, {
      workspaceId,
      name: name.trim(),
      type: 'openai_compatible',
      baseUrl: baseUrl.trim(),
      presetId: 'openai_compatible',
    })
    if (!result.ok) return
    await handleChanged()
  }

  if (loading) {
    return (
      <SettingsSection title={t('settings.modelService.title')}>
        <p className="tm-settings-placeholder-text">{t('settings.modelService.loadingPanel')}</p>
      </SettingsSection>
    )
  }

  return (
    <div className="tm-model-service">
      <SettingsSection
        title={t('settings.modelService.title')}
        intro={t('settings.modelService.intro')}
      >
        {enabledModels.length === 0 ? (
          <p className="tm-model-service-empty">{t('settings.modelService.empty')}</p>
        ) : (
          <div className="tm-model-service-overview">
            {enabledModels.map((item) => (
              <div key={`${item.providerId}:${item.modelId}`} className="tm-model-service-chip">
                <span className="tm-model-service-chip-provider">{item.providerName}</span>
                <span className="tm-model-service-chip-sep">/</span>
                <span className="tm-model-service-chip-model">{item.modelName}</span>
                {item.isEmbedding && (
                  <span className="tm-model-service-chip-tag tm-model-service-chip-tag--embed">
                    {t('settings.modelService.tagEmbed')}
                  </span>
                )}
                {item.isRerank && (
                  <span className="tm-model-service-chip-tag tm-model-service-chip-tag--rerank">
                    {t('settings.modelService.tagRerank')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="tm-model-service-stats">
          <span>
            {t('settings.modelService.statsEnabledProviders', {
              count: providers.filter((p) => p.isEnabled).length,
            })}
          </span>
          <span>·</span>
          <span>{t('settings.modelService.statsChatModels', { count: chatModels.length })}</span>
          {embeddingModels.length > 0 && (
            <>
              <span>·</span>
              <span>
                {t('settings.modelService.statsEmbeddingModels', { count: embeddingModels.length })}
              </span>
            </>
          )}
          {rerankModels.length > 0 && (
            <>
              <span>·</span>
              <span>
                {t('settings.modelService.statsRerankModels', { count: rerankModels.length })}
              </span>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.modelService.localTitle')}
        intro={t('settings.modelService.localIntro')}
      >
        <ProviderConfigPanel
          workspaceId={workspaceId}
          preset={OLLAMA_PRESET}
          provider={ollamaProvider}
          providers={providers}
          onChanged={handleChanged}
        />
      </SettingsSection>

      <SettingsSection
        title={t('settings.modelService.networkTitle')}
        intro={t('settings.modelService.networkIntro')}
      >
        <div className="tm-model-service-network-list">
          {NETWORK_PROVIDER_PRESETS.map((preset) => (
            <ProviderConfigPanel
              key={preset.id}
              workspaceId={workspaceId}
              preset={preset}
              provider={findProviderForPreset(providers, preset)}
              providers={providers}
              onChanged={handleChanged}
            />
          ))}

          {customNetworkProviders.map((provider) => (
            <ProviderConfigPanel
              key={provider.id}
              workspaceId={workspaceId}
              preset={{
                id: 'openai_compatible',
                name: provider.name,
                type: provider.type,
                defaultBaseUrl: provider.baseUrl ?? 'https://api.openai.com/v1',
                docUrl: 'https://platform.openai.com/docs/guides/text-generation',
                modelsDocUrl: 'https://platform.openai.com/docs/models',
                isLocal: false,
              }}
              provider={provider}
              providers={providers}
              onChanged={handleChanged}
            />
          ))}

          <button type="button" className="tm-provider-add-custom-btn" onClick={() => void handleAddCustomProvider()}>
            <IconPlus size={14} />
            {t('settings.modelService.addCustomProvider')}
          </button>
        </div>
      </SettingsSection>
    </div>
  )
}
