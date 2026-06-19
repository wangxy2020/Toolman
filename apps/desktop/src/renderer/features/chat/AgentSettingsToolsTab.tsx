import { useEffect, useState } from 'react'
import { IpcChannel, type McpServerConfig, type McpStatusItem } from '@toolman/shared'
import { IconSearch } from '../../components/icons'
import { MCP_SERVERS, PREAUTH_TOOLS } from './agent-settings-constants'

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

interface Props {
  toolStates: Record<string, boolean>
  mcpServerIds: string[]
  workingDirectory?: string
  environmentVariables?: string
  onToolChange: (toolId: string, enabled: boolean) => void
  onMcpToggle: (serverId: string, enabled: boolean) => void
}

export function AgentSettingsToolsTab({
  toolStates,
  mcpServerIds,
  workingDirectory,
  environmentVariables,
  onToolChange,
  onMcpToggle,
}: Props) {
  const [servers, setServers] = useState<McpServerConfig[]>(() =>
    MCP_SERVERS.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description,
      type: 'builtin' as const,
      enabled: true,
    })),
  )
  const [statusMap, setStatusMap] = useState<Record<string, McpStatusItem>>({})

  useEffect(() => {
    let cancelled = false

    void window.api.invoke(IpcChannel.McpServerList, {}).then((result) => {
      if (cancelled || !result.ok) return
      const data = result.data as { items: McpServerConfig[] }
      if (data.items.length > 0) setServers(data.items)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const serverIds = servers.map((server) => server.id)
    if (serverIds.length === 0) return

    void window.api
      .invoke(IpcChannel.McpStatusList, {
        serverIds,
        workingDirectory,
        environmentVariables,
      })
      .then((result) => {
        if (cancelled || !result.ok) return
        const data = result.data as { items: McpStatusItem[] }
        setStatusMap(Object.fromEntries(data.items.map((item) => [item.id, item])))
      })

    return () => {
      cancelled = true
    }
  }, [servers, workingDirectory, environmentVariables])

  return (
    <div className="tm-agent-tab-panel">
      <div className="tm-agent-tab-head">
        <h3 className="tm-agent-tab-title">MCP 服务器</h3>
      </div>
      <div className="tm-tool-list">
        {servers.map((server) => {
          const enabled = mcpServerIds.includes(server.id)
          const status = statusMap[server.id]
          const connected = Boolean(enabled && status?.connected)
          const globallyDisabled = !server.enabled
          const statusLabel = globallyDisabled
            ? '全局已禁用'
            : !enabled
              ? '未启用'
              : connected
                ? '已连接'
                : '未连接'
          const statusTitle = status?.reason

          return (
            <div key={server.id} className="tm-settings-tool-item">
              <div className="tm-settings-tool-item-main">
                <div className="tm-settings-tool-item-name">
                  {server.name}
                  {server.type === 'stdio' ? (
                    <span className="tm-settings-tool-item-badge">stdio</span>
                  ) : null}
                </div>
                <div className="tm-settings-tool-item-desc">{server.description}</div>
                <span
                  className={`tm-tool-tag ${connected ? 'tm-tool-tag--on' : 'tm-tool-tag--off'}`}
                  title={statusTitle}
                >
                  {statusLabel}
                </span>
              </div>
              <Toggle
                checked={enabled && !globallyDisabled}
                onChange={(v) => {
                  if (!globallyDisabled) onMcpToggle(server.id, v)
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="tm-agent-tab-head tm-agent-tab-head--spaced">
        <h3 className="tm-agent-tab-title">
          预授权工具
          <button type="button" className="tm-agent-tab-search" title="搜索工具">
            <IconSearch size={14} />
          </button>
        </h3>
      </div>
      <div className="tm-tool-list">
        {PREAUTH_TOOLS.map((tool) => {
          const enabled = toolStates[tool.id] ?? tool.defaultEnabled
          return (
            <div key={tool.id} className="tm-settings-tool-item">
              <div className="tm-settings-tool-item-main">
                <div className="tm-settings-tool-item-name">{tool.name}</div>
                <div className="tm-settings-tool-item-desc">{tool.description}</div>
                <span className={`tm-tool-tag ${enabled ? 'tm-tool-tag--on' : 'tm-tool-tag--off'}`}>
                  {enabled ? tool.tagOn : tool.tagOff}
                </span>
              </div>
              <Toggle checked={enabled} onChange={(v) => onToolChange(tool.id, v)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
