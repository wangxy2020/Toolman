import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type McpServerConfig, type McpStatusItem } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { EMPTY_STDIO_DRAFT } from './McpServerEditModal'
import { withPostgresDefaults } from './mcp-db-connection'
import {
  canPersist,
  finalizeConfig,
  groupServers,
  isSystemDefaultServer,
} from './mcp-settings-utils'

export function useMcpSettingsPanel() {
  const { t } = useI18n()
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, McpStatusItem>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<McpServerConfig>(EMPTY_STDIO_DRAFT)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const groupedServers = useMemo(() => groupServers(servers, t), [servers, t])

  const loadServers = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.McpServerList, {})
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: McpServerConfig[] }
    setServers(data.items)
    setError(null)
  }, [])

  const loadStatus = useCallback(async (items: McpServerConfig[]) => {
    if (items.length === 0) {
      setStatusMap({})
      return
    }
    const result = await window.api.invoke(IpcChannel.McpStatusList, {
      serverIds: items.map((server) => server.id),
    })
    if (!result.ok) return
    const data = result.data as { items: McpStatusItem[] }
    setStatusMap(Object.fromEntries(data.items.map((item) => [item.id, item])))
  }, [])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  useEffect(() => {
    if (servers.length > 0) {
      void loadStatus(servers)
    }
  }, [servers, loadStatus])

  const saveServer = useCallback(
    async (config: McpServerConfig) => {
      const result = await window.api.invoke(IpcChannel.McpServerUpsert, config)
      if (!result.ok) {
        setError(result.error.message)
        return false
      }
      await loadServers()
      return true
    },
    [loadServers],
  )

  const scheduleSave = useCallback(
    (config: McpServerConfig, isCreating: boolean) => {
      if (!canPersist(config, isCreating)) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        void saveServer(finalizeConfig(config))
      }, 500)
    },
    [saveServer],
  )

  const handleToggle = useCallback(
    async (server: McpServerConfig, enabled: boolean) => {
      await saveServer({ ...server, enabled })
      void loadStatus(servers.map((item) => (item.id === server.id ? { ...item, enabled } : item)))
    },
    [saveServer, loadStatus, servers],
  )

  const formatTestResult = useCallback(
    (data: { success: boolean; toolCount?: number; serverName?: string; error?: string }) => {
      if (!data.success) return data.error ?? t('settings.mcp.test.failed')
      return t('settings.mcp.test.success', {
        toolCount:
          data.toolCount != null
            ? t('settings.mcp.test.toolCount', { count: data.toolCount })
            : '',
        serverName: data.serverName
          ? t('settings.mcp.test.serverName', { name: data.serverName })
          : '',
      })
    },
    [t],
  )

  const handleTest = useCallback(
    async (serverId: string) => {
      setTestingId(serverId)
      const result = await window.api.invoke(IpcChannel.McpServerTest, { id: serverId })
      setTestingId(null)
      if (!result.ok) {
        setTestResults((prev) => ({ ...prev, [serverId]: result.error.message }))
        return
      }
      const data = result.data as {
        success: boolean
        toolCount?: number
        serverName?: string
        error?: string
      }
      setTestResults((prev) => ({ ...prev, [serverId]: formatTestResult(data) }))
      void loadStatus(servers)
    },
    [formatTestResult, loadStatus, servers],
  )

  const handleDelete = useCallback(
    async (server: McpServerConfig) => {
      if (server.type === 'builtin' || isSystemDefaultServer(server.id)) return
      if (!window.confirm(t('settings.mcp.delete.confirm', { name: server.name }))) return

      const result = await window.api.invoke(IpcChannel.McpServerDelete, { id: server.id })
      if (!result.ok) {
        setError(result.error.message)
        return
      }

      if (modalOpen && draft.id === server.id) {
        setModalOpen(false)
      }
      setTestResults((prev) => {
        const next = { ...prev }
        delete next[server.id]
        return next
      })
      await loadServers()
    },
    [draft.id, loadServers, modalOpen, t],
  )

  const openCreate = () => {
    setDraft({
      ...EMPTY_STDIO_DRAFT,
      id: `mcp-${Date.now().toString(36)}`,
    })
    setCreating(true)
    setModalOpen(true)
  }

  const openEdit = (server: McpServerConfig) => {
    const normalized =
      server.type === 'builtin'
        ? server
        : withPostgresDefaults({
            ...server,
            type: server.type === 'sse' || server.type === 'streamableHttp' ? server.type : 'stdio',
            command: server.command?.trim() || 'npx',
            packageSource: server.packageSource ?? 'default',
            longRunning: server.longRunning ?? false,
            timeoutSeconds: server.timeoutSeconds ?? 60,
          })
    setDraft(normalized)
    setCreating(false)
    setModalOpen(true)
  }

  const cancelModal = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setModalOpen(false)
  }

  const confirmModal = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (canPersist(draft, creating)) {
      void saveServer(finalizeConfig(draft)).then((ok) => {
        if (ok) setModalOpen(false)
      })
      return
    }
    setModalOpen(false)
  }

  const handleDraftChange = (patch: Partial<McpServerConfig>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      scheduleSave(next, creating)
      return next
    })
  }

  const getStatusLabel = (server: McpServerConfig) => {
    if (!server.enabled) return { text: t('settings.mcp.status.disabled'), connected: false }
    const status = statusMap[server.id]
    if (!status) return { text: t('settings.mcp.status.checking'), connected: false }
    if (status.connected) return { text: t('settings.mcp.status.connected'), connected: true }
    return { text: t('settings.mcp.status.disconnected'), connected: false, reason: status.reason }
  }

  return {
    groupedServers,
    loading,
    error,
    modalOpen,
    creating,
    draft,
    testingId,
    testResults,
    openCreate,
    openEdit,
    cancelModal,
    confirmModal,
    handleDraftChange,
    handleToggle,
    handleTest,
    handleDelete,
    getStatusLabel,
  }
}
