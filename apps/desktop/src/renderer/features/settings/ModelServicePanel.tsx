import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider } from '@toolman/shared'
import { IconPlus } from '../../components/icons'
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
    const name = window.prompt('服务商名称', '自定义 OpenAI 兼容')
    if (!name?.trim()) return
    const baseUrl = window.prompt('API 地址', 'https://api.example.com/v1')
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
      <SettingsSection title="模型服务">
        <p className="tm-settings-placeholder-text">正在加载模型服务…</p>
      </SettingsSection>
    )
  }

  return (
    <div className="tm-model-service">
      <SettingsSection
        title="模型服务"
        intro="管理已安装并启用的模型，包括对话、嵌入等类型。"
      >
        {enabledModels.length === 0 ? (
          <p className="tm-model-service-empty">暂无已启用的模型，请在下方开启本地或网络大模型并获取模型列表。</p>
        ) : (
          <div className="tm-model-service-overview">
            {enabledModels.map((item) => (
              <div key={`${item.providerId}:${item.modelId}`} className="tm-model-service-chip">
                <span className="tm-model-service-chip-provider">{item.providerName}</span>
                <span className="tm-model-service-chip-sep">/</span>
                <span className="tm-model-service-chip-model">{item.modelName}</span>
                {item.isEmbedding && (
                  <span className="tm-model-service-chip-tag tm-model-service-chip-tag--embed">嵌入</span>
                )}
                {item.isRerank && (
                  <span className="tm-model-service-chip-tag tm-model-service-chip-tag--rerank">重排</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="tm-model-service-stats">
          <span>
            已启用服务商 {providers.filter((p) => p.isEnabled).length} 个
          </span>
          <span>·</span>
          <span>对话模型 {chatModels.length} 个</span>
          {embeddingModels.length > 0 && (
            <>
              <span>·</span>
              <span>嵌入模型 {embeddingModels.length} 个</span>
            </>
          )}
          {rerankModels.length > 0 && (
            <>
              <span>·</span>
              <span>重排模型 {rerankModels.length} 个</span>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="本地大模型" intro="通过 Ollama 在本地运行开源大模型，无需 API Key。">
        <ProviderConfigPanel
          workspaceId={workspaceId}
          preset={OLLAMA_PRESET}
          provider={ollamaProvider}
          providers={providers}
          onChanged={handleChanged}
        />
      </SettingsSection>

      <SettingsSection
        title="网络大模型"
        intro="配置云端 API 服务商。启用后填写 API 密钥与地址，可检测连接并拉取模型列表。"
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
            添加自定义 OpenAI 兼容服务商
          </button>
        </div>
      </SettingsSection>
    </div>
  )
}
