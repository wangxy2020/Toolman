import { LOCAL_DB_MCP_SERVER_ID, type McpServerConfig, type McpStatusItem } from '@toolman/shared'
import { IconMinus, IconSliders } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { resolveMcpServerDescription } from '../../i18n/settings-labels'
import { SettingsToggle } from './SettingsShared'
import { isSystemDefaultServer } from './mcp-settings-utils'

interface Props {
  server: McpServerConfig
  status: { text: string; connected: boolean; reason?: string }
  testLabel?: string
  testing: boolean
  onEdit: (server: McpServerConfig) => void
  onDelete: (server: McpServerConfig) => void
  onTest: (serverId: string) => void
  onToggle: (server: McpServerConfig, enabled: boolean) => void
}

export function McpServerRow({
  server,
  status,
  testLabel,
  testing,
  onEdit,
  onDelete,
  onTest,
  onToggle,
}: Props) {
  const { t } = useI18n()
  const isBuiltin = server.type === 'builtin'
  const isLocalDb = server.id === LOCAL_DB_MCP_SERVER_ID
  const cmdLine =
    !isBuiltin && !isLocalDb && server.command
      ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')
      : null
  const description = resolveMcpServerDescription(server.id, server.description, t)

  return (
    <div className="tm-mcp-server-card">
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
          title={t('settings.mcp.servers.editTitle')}
          onClick={() => onEdit(server)}
        >
          <IconSliders size={14} />
        </button>
        {server.type !== 'builtin' && !isSystemDefaultServer(server.id) ? (
          <button
            type="button"
            className="tm-provider-icon-btn tm-provider-icon-btn--danger"
            title={t('settings.mcp.servers.deleteTitle')}
            onClick={() => void onDelete(server)}
          >
            <IconMinus size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="tm-data-btn"
          disabled={testing || !server.enabled}
          onClick={() => void onTest(server.id)}
        >
          {testing
            ? t('settings.mcp.servers.testing')
            : t('settings.mcp.servers.testConnection')}
        </button>
        <SettingsToggle
          checked={server.enabled}
          onChange={(enabled) => void onToggle(server, enabled)}
        />
      </div>
    </div>
  )
}

export type { McpStatusItem }
