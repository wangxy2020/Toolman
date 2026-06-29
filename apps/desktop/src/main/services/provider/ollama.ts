import { logStructured } from '../structured-log.service'
import { ProviderPullModelInputSchema } from '@toolman/shared'
import { parseConfig, readPresetId, rowToConfig } from './helpers'
import { fetchProviderModels, getProviderRow, listProviders } from './crud'

function resolveOllamaNativeBaseUrl(baseUrl?: string | null): string {
  const raw = (baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
  return raw.replace(/\/v1$/i, '')
}

export async function pullOllamaModel(input: unknown) {
  const { id, modelId } = ProviderPullModelInputSchema.parse(input)
  const row = getProviderRow(id)
  if (!row) throw new Error('Provider not found')

  const presetId = readPresetId(parseConfig(row.configJson))
  if (row.type !== 'ollama' && presetId !== 'ollama') {
    throw new Error('Only Ollama providers support model pull')
  }

  const config = rowToConfig(row)
  const response = await fetch(`${resolveOllamaNativeBaseUrl(config.baseUrl)}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelId, stream: true }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`拉取模型失败 (${response.status}): ${detail}`)
  }

  const reader = response.body?.getReader()
  if (reader) {
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }

  await fetchProviderModels({ id, persist: true })
  return { modelId, success: true as const }
}

/** 启动时从本地 Ollama 同步可用对话模型 */
export async function syncOllamaProviders(workspaceId: string): Promise<void> {
  const rows = listProviders({ workspaceId, enabledOnly: true }).filter((p) => p.type === 'ollama')
  for (const provider of rows) {
    try {
      await fetchProviderModels({ id: provider.id })
    } catch (error) {
      logStructured('syncOllama', 'error', `${provider.name}:`, { detail: error })
    }
  }
}
