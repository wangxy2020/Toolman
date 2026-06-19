import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider } from '@toolman/shared'
import { listEnabledModels } from '../settings/provider-model-utils'

export interface KnowledgeModelOption {
  value: string
  label: string
  providerId: string
  modelId: string
}

export function encodeModelRef(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

export function decodeModelRef(value: string): { providerId: string; modelId: string } | null {
  const separator = value.indexOf('::')
  if (separator < 0) return null

  const modelId = value.slice(separator + 2)
  if (!modelId) return null

  return {
    providerId: separator === 0 ? '' : value.slice(0, separator),
    modelId,
  }
}

export function formatModelLabel(modelId: string, providerName: string): string {
  return `${modelId} | ${providerName}`
}

export function useKnowledgeSettingsModels(workspaceId: string) {
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

  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.isEnabled),
    [providers],
  )

  const embeddingModels = useMemo<KnowledgeModelOption[]>(() => {
    return listEnabledModels(providers)
      .filter((model) => model.isEmbedding)
      .map((model) => ({
        value: encodeModelRef(model.providerId, model.modelId),
        label: formatModelLabel(model.modelId, model.providerName),
        providerId: model.providerId,
        modelId: model.modelId,
      }))
  }, [providers])

  const rerankModels = useMemo<KnowledgeModelOption[]>(() => {
    return listEnabledModels(providers)
      .filter((model) => model.isRerank)
      .map((model) => ({
        value: encodeModelRef(model.providerId, model.modelId),
        label: formatModelLabel(model.modelId, model.providerName),
        providerId: model.providerId,
        modelId: model.modelId,
      }))
  }, [providers])

  const docProcessorProviders = useMemo(
    () =>
      enabledProviders.map((provider) => ({
        value: provider.id,
        label: provider.name,
      })),
    [enabledProviders],
  )

  const defaultDocProcessorProviderId = useMemo(() => {
    const ollama = enabledProviders.find((provider) => provider.type === 'ollama')
    return ollama?.id ?? ''
  }, [enabledProviders])

  const defaultEmbeddingRef = useMemo(() => {
    const preferred = embeddingModels.find(
      (model) => model.modelId === 'bge-m3:latest' && model.label.endsWith('| Ollama'),
    )
    if (preferred) return preferred.value

    const bgeM3 = embeddingModels.find((model) => model.modelId === 'bge-m3:latest')
    if (bgeM3) return bgeM3.value

    return embeddingModels[0]?.value ?? ''
  }, [embeddingModels])

  return {
    loading,
    embeddingModels,
    rerankModels,
    docProcessorProviders,
    defaultDocProcessorProviderId,
    defaultEmbeddingRef,
  }
}
