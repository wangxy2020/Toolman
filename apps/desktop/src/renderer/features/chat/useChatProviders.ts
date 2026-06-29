import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type Assistant, type Provider } from '@toolman/shared'
import { normalizeModelIds } from './model-utils'
import type { AppSettings } from '../settings/app-settings'

export function useChatProviders(
  workspaceId: string | null,
  appSettings?: AppSettings,
) {
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    if (!workspaceId) return
    const result = await window.api.invoke(IpcChannel.ProviderList, { workspaceId })
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    let items = (result.data as Provider[]).filter((p) => p.isEnabled)

    for (const provider of items) {
      if (provider.type !== 'ollama' || !provider.isEnabled) continue
      const fetched = await window.api.invoke(IpcChannel.ProviderFetchModels, { id: provider.id })
      if (fetched.ok) {
        const data = fetched.data as { models: Provider['models'] }
        items = items.map((p) =>
          p.id === provider.id ? { ...p, models: data.models, hasApiKey: true } : p,
        )
      }
    }

    setProviders(items)
  }, [workspaceId])

  const loadAssistants = useCallback(async () => {
    if (!workspaceId) return
    const result = await window.api.invoke(IpcChannel.AssistantList, { workspaceId })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const items = result.data as Assistant[]
    setAssistants(items)
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId) return
    void Promise.all([loadProviders(), loadAssistants()])
  }, [workspaceId, loadProviders, loadAssistants])

  useEffect(() => {
    if (providers.length === 0 && assistants.length === 0) return
    setSelectedModelIds((prev) =>
      normalizeModelIds(prev, providers, assistants, appSettings?.defaultChatModelId),
    )
  }, [providers, assistants, appSettings?.defaultChatModelId])

  const hasConfiguredProvider = providers.some(
    (p) => p.isEnabled && (p.hasApiKey || p.type === 'ollama'),
  )
  const defaultAssistant = assistants[0] ?? null

  return {
    assistants,
    providers,
    selectedModelIds,
    setSelectedModelIds,
    loadProviders,
    loadAssistants,
    hasConfiguredProvider,
    defaultAssistant,
    error,
    setError,
  }
}
