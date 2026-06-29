import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CHANNEL_PLATFORMS,
  IpcChannel,
  type Assistant,
  type ChannelPlatformId,
  type ChannelRuntimeStatus,
  type ImChannelConfigPublic,
} from '@toolman/shared'
import {
  clearLegacyChannelConfigs,
  loadLegacyChannelConfigs,
} from './channel-settings'

export function useChannelsSettingsPanel(workspaceId: string | null) {
  const [configs, setConfigs] = useState<ImChannelConfigPublic[]>([])
  const [statuses, setStatuses] = useState<Record<string, ChannelRuntimeStatus>>({})
  const [statusMessages, setStatusMessages] = useState<Record<string, string | undefined>>({})
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('')
  const [webhookPaths, setWebhookPaths] = useState<Record<string, string>>({})
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [editingPlatform, setEditingPlatform] = useState<ChannelPlatformId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadChannels = useCallback(async () => {
    setLoading(true)
    const [listResult, statusResult, webhookResult] = await Promise.all([
      window.api.invoke(IpcChannel.ImChannelList, {}),
      window.api.invoke(IpcChannel.ImChannelStatusList, {}),
      window.api.invoke(IpcChannel.ImChannelWebhookInfo, {}),
    ])
    setLoading(false)

    if (!listResult.ok) {
      setError(listResult.error.message)
      return
    }

    const listData = listResult.data as {
      webhookBaseUrl: string
      items: ImChannelConfigPublic[]
    }
    setConfigs(listData.items)
    setWebhookBaseUrl(listData.webhookBaseUrl)

    if (statusResult.ok) {
      const statusData = statusResult.data as {
        items: Array<{
          platform: ChannelPlatformId
          status: ChannelRuntimeStatus
          message?: string
        }>
      }
      setStatuses(Object.fromEntries(statusData.items.map((item) => [item.platform, item.status])))
      setStatusMessages(Object.fromEntries(statusData.items.map((item) => [item.platform, item.message])))
    }

    if (webhookResult.ok) {
      const webhookData = webhookResult.data as { paths: Record<string, string> }
      setWebhookPaths(webhookData.paths)
    }

    setError(null)
  }, [])

  useEffect(() => {
    void (async () => {
      const legacy = loadLegacyChannelConfigs()
      for (const item of legacy) {
        await window.api.invoke(IpcChannel.ImChannelUpsert, item)
      }
      if (legacy.length > 0) clearLegacyChannelConfigs()
      await loadChannels()
    })()
  }, [loadChannels])

  useEffect(() => {
    if (!workspaceId) return
    void (async () => {
      const result = await window.api.invoke(IpcChannel.AssistantList, { workspaceId })
      if (result.ok) {
        setAssistants(result.data as Assistant[])
      }
    })()
  }, [workspaceId])

  const configMap = useMemo(
    () => Object.fromEntries(configs.map((item) => [item.platform, item])),
    [configs],
  )

  const editingConfig = editingPlatform ? configMap[editingPlatform] : null

  const handleSave = async (
    config: Partial<ImChannelConfigPublic> & {
      platform: ChannelPlatformId
      appSecret?: string
      encryptKey?: string
    },
  ) => {
    const result = await window.api.invoke(IpcChannel.ImChannelUpsert, config)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setEditingPlatform(null)
    await loadChannels()
  }

  const handleTest = async (platform: ChannelPlatformId): Promise<string | null> => {
    const result = await window.api.invoke(IpcChannel.ImChannelTest, { platform })
    if (!result.ok) return result.error.message
    const data = result.data as { ok: boolean; message: string }
    return data.message
  }

  return {
    configs,
    statuses,
    statusMessages,
    webhookBaseUrl,
    webhookPaths,
    assistants,
    editingPlatform,
    setEditingPlatform,
    error,
    loading,
    configMap,
    editingConfig,
    handleSave,
    handleTest,
    platforms: CHANNEL_PLATFORMS,
  }
}
