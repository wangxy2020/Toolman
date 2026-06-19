import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_MCP_SERVER_IDS,
  IpcChannel,
  LOCAL_DB_MCP_SERVER_ID,
  MCP_SETTINGS_CATEGORIES,
  isDuplicateOfficialMcpPreset,
  type McpServerConfig,
  type McpStatusItem,
} from '@toolman/shared'
import { IconMinus, IconPlus, IconSliders } from '../../components/icons'
import { MCP_SERVERS } from '../chat/agent-settings-constants'
import { McpServerEditModal, EMPTY_STDIO_DRAFT, applyPackageSource } from './McpServerEditModal'
import { withPostgresDefaults } from './mcp-db-connection'
import { SettingsPageLayout, SettingsSection, SettingsToggle } from './SettingsShared'

function finalizeConfig(config: McpServerConfig): McpServerConfig {
  if (config.type === 'builtin') return config
  return applyPackageSource(withPostgresDefaults(config))
}

function isSystemDefaultServer(id: string): boolean {
  return DEFAULT_MCP_SERVER_IDS.includes(id as (typeof DEFAULT_MCP_SERVER_IDS)[number])
}

function canPersist(config: McpServerConfig, creating: boolean): boolean {
  if (!config.name.trim()) return false
  if (config.type === 'builtin') return true
  if (!config.command?.trim()) return false
  if (creating && !config.id.trim()) return false
  return true
}

const CUSTOM_CATEGORY = {
  id: 'custom',
  title: '自定义',
  description: '通过 uvx/npx 或 HTTP 传输连接的外部 MCP 服务器，可按需添加或删除',
  serverIds: [] as const,
} as const

type McpSettingsCategoryGroup = {
  id: string
  title: string
  description: string
  serverIds: readonly string[]
  servers: McpServerConfig[]
}

function resolveCategoryServer(id: string, servers: McpServerConfig[]): McpServerConfig | null {
  const existing = servers.find((server) => server.id === id)
  if (existing) return existing

  const meta = MCP_SERVERS.find((server) => server.id === id)
  if (!meta) return null

  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    type: 'stdio',
    enabled: false,
  }
}

function sortServersByName(servers: McpServerConfig[]): McpServerConfig[] {
  return [...servers].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

function groupServers(servers: McpServerConfig[]): McpSettingsCategoryGroup[] {
  const knownIds = new Set<string>(
    MCP_SETTINGS_CATEGORIES.flatMap((category) => category.serverIds),
  )

  const categorized: McpSettingsCategoryGroup[] = MCP_SETTINGS_CATEGORIES.map((category) => ({
    ...category,
    servers: sortServersByName(
      category.serverIds
        .map((id) => resolveCategoryServer(id, servers))
        .filter((server): server is McpServerConfig => Boolean(server)),
    ),
  }))

  const customServers = sortServersByName(
    servers.filter(
      (server) => !knownIds.has(server.id) && !isDuplicateOfficialMcpPreset(server),
    ),
  )
  categorized.push({ ...CUSTOM_CATEGORY, servers: customServers })

  return categorized
}

export function McpSettingsPanel() {
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

  const groupedServers = useMemo(() => groupServers(servers), [servers])

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
      setTestResults((prev) => ({
        ...prev,
        [serverId]: data.success
          ? `连接成功${data.toolCount != null ? `，${data.toolCount} 个工具` : ''}${
              data.serverName ? `（${data.serverName}）` : ''
            }`
          : (data.error ?? '连接失败'),
      }))
      void loadStatus(servers)
    },
    [loadStatus, servers],
  )

  const handleDelete = useCallback(
    async (server: McpServerConfig) => {
      if (server.type === 'builtin' || isSystemDefaultServer(server.id)) return
      if (!window.confirm(`确定删除 MCP 服务器「${server.name}」？`)) return

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
    [draft.id, loadServers, modalOpen],
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

  const closeModal = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (canPersist(draft, creating)) {
      void saveServer(finalizeConfig(draft))
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
    if (!server.enabled) return { text: '未启用', connected: false }
    const status = statusMap[server.id]
    if (!status) return { text: '检测中…', connected: false }
    if (status.connected) return { text: '已连接', connected: true }
    return { text: '未连接', connected: false, reason: status.reason }
  }

  const renderServerRow = (server: McpServerConfig) => {
    const isBuiltin = server.type === 'builtin'
    const isLocalDb = server.id === LOCAL_DB_MCP_SERVER_ID
    const status = getStatusLabel(server)
    const testLabel = testResults[server.id]
    const cmdLine =
      !isBuiltin && !isLocalDb && server.command
        ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
        : null
    const description = isLocalDb ? '访问本地 PostgreSQL 数据库' : server.description

    return (
      <div key={server.id} className="tm-mcp-server-card">
        <div className="tm-mcp-server-main">
          <div className="tm-mcp-server-head">
            <span className="tm-mcp-server-name">{server.name}</span>
            <span className={`tm-mcp-server-type ${isBuiltin ? '' : 'tm-mcp-server-type--stdio'}`}>
              {isBuiltin ? 'builtin' : server.type}
            </span>
            <span
              className={`tm-mcp-status-tag ${status.connected ? 'tm-mcp-status-tag--on' : 'tm-mcp-status-tag--off'}`}
              title={status.reason}
            >
              {status.text}
            </span>
          </div>
          {description ? <div className="tm-mcp-server-desc">{description}</div> : null}
          {cmdLine ? <div className="tm-mcp-server-cmd">{cmdLine}</div> : null}
          {testLabel ? <div className="tm-mcp-server-test">{testLabel}</div> : null}
        </div>
        <div className="tm-mcp-server-actions">
          <button
            type="button"
            className="tm-provider-icon-btn"
            title="编辑MCP服务器"
            onClick={() => openEdit(server)}
          >
            <IconSliders size={14} />
          </button>
          {server.type !== 'builtin' && !isSystemDefaultServer(server.id) ? (
            <button
              type="button"
              className="tm-provider-icon-btn tm-provider-icon-btn--danger"
              title="删除MCP服务器"
              onClick={() => void handleDelete(server)}
            >
              <IconMinus size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="tm-data-btn"
            disabled={testingId === server.id || !server.enabled}
            onClick={() => void handleTest(server.id)}
          >
            {testingId === server.id ? '测试中…' : '测试连接'}
          </button>
          <SettingsToggle
            checked={server.enabled}
            onChange={(enabled) => void handleToggle(server, enabled)}
          />
        </div>
      </div>
    )
  }

  return (
    <>
      <SettingsPageLayout>
        {error ? <div className="tm-settings-error">{error}</div> : null}
        {loading ? <div className="tm-settings-loading">加载中…</div> : null}

        {groupedServers.map((category) => (
          <SettingsSection
            key={category.id}
            title={category.title}
            intro={category.description}
            action={
              category.id === 'servers' ? (
                <button type="button" className="tm-mcp-add-btn" onClick={openCreate}>
                  <IconPlus size={14} />
                  添加
                </button>
              ) : undefined
            }
          >
            {category.servers.length > 0 ? (
              <div className="tm-mcp-server-list">{category.servers.map(renderServerRow)}</div>
            ) : category.id === 'custom' ? (
              <div className="tm-mcp-empty-hint">暂无自定义 MCP 服务器。</div>
            ) : null}
          </SettingsSection>
        ))}
      </SettingsPageLayout>

      {modalOpen ? (
        <McpServerEditModal
          draft={draft}
          creating={creating}
          onChange={handleDraftChange}
          onClose={closeModal}
        />
      ) : null}
    </>
  )
}
