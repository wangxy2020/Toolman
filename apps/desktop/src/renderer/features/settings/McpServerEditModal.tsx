import { useEffect, useState } from 'react'
import {
  IpcChannel,
  type McpPromptInfo,
  type McpResourceInfo,
  type McpServerConfig,
  type McpToolInfo,
} from '@toolman/shared'
import { LOCAL_DB_MCP_SERVER_ID } from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'
import {
  buildPostgresArgs,
  isPostgresMcpServer,
  normalizeTransportType,
  resolveDbConnection,
} from './mcp-db-connection'
import { SettingsInput, SettingsSelect, SettingsToggle } from './SettingsShared'

type ModalTab = 'general' | 'tools' | 'prompts' | 'resources'

type CustomTransportType = 'stdio' | 'sse' | 'streamableHttp'

const TRANSPORT_OPTIONS: Array<{ value: CustomTransportType; label: string }> = [
  { value: 'stdio', label: '标准输入 / 输出 (stdio)' },
  { value: 'sse', label: '服务器发送事件 (sse)' },
  { value: 'streamableHttp', label: '可流式传输的HTTP (streamableHttp)' },
]

const EMPTY_STDIO_DRAFT: McpServerConfig = {
  id: '',
  name: '',
  description: '',
  type: 'stdio',
  enabled: true,
  command: '',
  args: [],
  env: {},
  packageSource: 'default',
  longRunning: false,
  timeoutSeconds: 60,
}

function parseArgsInput(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseEnvInput(value: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of value.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

function formatEnv(env?: Record<string, string>): string {
  if (!env || Object.keys(env).length === 0) return ''
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function parseTagsInput(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function formatTags(tags?: string[]): string {
  return (tags ?? []).join(', ')
}

function applyPackageSource(config: McpServerConfig): McpServerConfig {
  if (config.packageSource !== 'taobao' || config.command?.trim() !== 'npx') {
    return config
  }
  return {
    ...config,
    env: {
      ...config.env,
      NPM_CONFIG_REGISTRY: 'https://registry.npmmirror.com',
    },
  }
}

function FormLabel({
  children,
  required,
  hint,
  htmlFor,
}: {
  children: string
  required?: boolean
  hint?: string
  htmlFor?: string
}) {
  return (
    <label className="tm-mcp-form-label" htmlFor={htmlFor}>
      {children}
      {required ? <span className="tm-mcp-form-required">*</span> : null}
      {hint ? (
        <span className="tm-mcp-form-help" title={hint} aria-label={hint}>
          ⓘ
        </span>
      ) : null}
    </label>
  )
}

interface Props {
  draft: McpServerConfig
  creating: boolean
  onChange: (patch: Partial<McpServerConfig>) => void
  onCancel: () => void
  onConfirm: () => void
}

export function McpServerEditModal({ draft, creating, onChange, onCancel, onConfirm }: Props) {
  const [tab, setTab] = useState<ModalTab>('general')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [tools, setTools] = useState<McpToolInfo[]>([])
  const [prompts, setPrompts] = useState<McpPromptInfo[]>([])
  const [resources, setResources] = useState<McpResourceInfo[]>([])

  const isBuiltin = draft.type === 'builtin'
  const isSqliteBuiltin = isBuiltin && (draft.builtinId ?? draft.id) === 'sqlite'
  const transportType = normalizeTransportType(draft.type)
  const isHttpTransport = transportType === 'sse' || transportType === 'streamableHttp'
  const showPostgresFields =
    !isBuiltin && !creating && (draft.id === LOCAL_DB_MCP_SERVER_ID || isPostgresMcpServer(draft))
  const db = resolveDbConnection(draft)

  useEffect(() => {
    setTab('general')
    setAdvancedOpen(false)
  }, [draft.id, creating])

  useEffect(() => {
    if (creating || !draft.id) {
      setTools([])
      setPrompts([])
      setResources([])
      return
    }

    let cancelled = false
    setInspectLoading(true)

    void window.api.invoke(IpcChannel.McpServerInspect, { id: draft.id }).then((result) => {
      if (cancelled) return
      setInspectLoading(false)
      if (!result.ok) return
      const data = result.data as {
        tools: McpToolInfo[]
        prompts: McpPromptInfo[]
        resources: McpResourceInfo[]
      }
      setTools(data.tools)
      setPrompts(data.prompts)
      setResources(data.resources)
    })

    return () => {
      cancelled = true
    }
  }, [draft.id, creating])

  const tabs: Array<{ id: ModalTab; label: string; count?: number }> = [
    { id: 'general', label: '通用设置' },
    { id: 'tools', label: '工具', count: tools.length },
    { id: 'prompts', label: '提示', count: prompts.length },
    { id: 'resources', label: '资源', count: resources.length },
  ]

  const updateDbField = (patch: Partial<McpServerConfig>) => {
    const next = { ...draft, ...patch }
    onChange({
      ...patch,
      args: buildPostgresArgs(next),
    })
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--mcp-edit" onClick={onCancel}>
      <div className="tm-mcp-edit-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="tm-mcp-modal-header">
          <h3 className="tm-mcp-modal-title">
            <span className="tm-channel-config-title-dot" aria-hidden="true" />
            {creating ? '添加 MCP 服务器' : draft.name}
          </h3>
          <button type="button" className="tm-mcp-modal-close" aria-label="关闭" onClick={onCancel}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-mcp-modal-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tm-mcp-modal-tab ${tab === item.id ? 'tm-mcp-modal-tab--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.count != null ? (
                <span className="tm-mcp-modal-tab-count">({item.count})</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="tm-mcp-modal-body">
          {tab === 'general' ? (
            <div className="tm-mcp-general-panel">
              {isSqliteBuiltin ? (
                <div className="tm-mcp-info-banner">
                  内置 SQLite 仅支持工作目录中的 <code>.db</code> / <code>.sqlite</code> 文件。
                  若要访问 PostgreSQL，请配置系统默认的 <strong>Local-db</strong> 服务器。
                </div>
              ) : null}

              <div className="tm-mcp-form-grid tm-mcp-form-grid--2">
                <div className="tm-mcp-form-field">
                  <FormLabel required>名称</FormLabel>
                  <SettingsInput
                    value={draft.name}
                    placeholder="例如: My MCP Server"
                    onChange={(name) => onChange({ name })}
                  />
                </div>

                {isBuiltin ? (
                  <div className="tm-mcp-form-field">
                    <FormLabel>类型</FormLabel>
                    <SettingsInput value="内置实现" disabled onChange={() => undefined} />
                  </div>
                ) : (
                  <div className="tm-mcp-form-field">
                    <FormLabel required>类型</FormLabel>
                    <SettingsSelect
                      value={transportType}
                      options={TRANSPORT_OPTIONS}
                      onChange={(type) => onChange({ type })}
                    />
                  </div>
                )}
              </div>

              <div className="tm-mcp-form-field">
                <FormLabel>描述</FormLabel>
                <SettingsInput
                  value={draft.description ?? ''}
                  placeholder="对此服务器功能的简要说明..."
                  onChange={(description) => onChange({ description })}
                />
              </div>

              {isBuiltin && (draft.builtinId ?? draft.id) === 'dify' ? (
                <div className="tm-mcp-form-field">
                  <FormLabel required hint="Dify 知识库 API 根地址">API 地址</FormLabel>
                  <SettingsInput
                    value={draft.providerUrl ?? 'https://api.dify.ai/v1'}
                    placeholder="https://api.dify.ai/v1"
                    onChange={(providerUrl) => onChange({ providerUrl })}
                  />
                </div>
              ) : null}

              {isBuiltin && (draft.builtinId ?? draft.id) === 'dify' ? (
                <div className="tm-mcp-form-field">
                  <FormLabel required hint="每行 KEY=VALUE">Dify API Key</FormLabel>
                  <textarea
                    className="tm-mcp-textarea"
                    rows={2}
                    value={formatEnv(draft.env)}
                    placeholder="DIFY_KEY=your-dataset-api-key"
                    onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
                  />
                </div>
              ) : null}

              {isBuiltin ? null : (
                <>
                  {isHttpTransport ? (
                    <div className="tm-mcp-form-field">
                      <FormLabel required>URL</FormLabel>
                      <SettingsInput
                        value={draft.url ?? ''}
                        placeholder="https://example.com/mcp"
                        onChange={(url) => onChange({ url })}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="tm-mcp-form-field">
                        <FormLabel required>命令</FormLabel>
                        <input
                          className="tm-mcp-form-input tm-mcp-form-input--mono"
                          value={draft.command ?? ''}
                          placeholder="npx"
                          onChange={(event) => onChange({ command: event.target.value })}
                        />
                      </div>

                      <div className="tm-mcp-form-field">
                        <FormLabel hint="npx 安装依赖时使用的 npm 源">包管理器源</FormLabel>
                        <div className="tm-mcp-package-source-group">
                          {(
                            [
                              { value: 'default', label: '默认' },
                              { value: 'taobao', label: '淘宝' },
                            ] as const
                          ).map((option) => (
                            <label key={option.value} className="tm-mcp-package-source-option">
                              <input
                                type="radio"
                                name="mcp-package-source"
                                checked={(draft.packageSource ?? 'default') === option.value}
                                onChange={() => onChange({ packageSource: option.value })}
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                          <label className="tm-mcp-package-source-option">
                            <input
                              type="radio"
                              name="mcp-package-source"
                              checked={(draft.packageSource ?? 'default') === 'custom'}
                              onChange={() => onChange({ packageSource: 'custom' })}
                            />
                            <span>自定义</span>
                          </label>
                        </div>
                      </div>

                      <div className="tm-mcp-form-field">
                        <FormLabel hint="每行输入一个启动参数">参数 (Arguments)</FormLabel>
                        <textarea
                          className="tm-mcp-textarea tm-mcp-textarea--code"
                          rows={3}
                          value={(draft.args ?? []).join('\n')}
                          placeholder={'-y\n@modelcontextprotocol/server-memory'}
                          onChange={(e) => onChange({ args: parseArgsInput(e.target.value) })}
                        />
                      </div>
                    </>
                  )}

                  {!isHttpTransport ? null : (
                    <div className="tm-mcp-form-field">
                      <FormLabel hint="可选，作为 HTTP 请求头（每行 KEY=VALUE）">
                        请求头 / 环境变量
                      </FormLabel>
                      <textarea
                        className="tm-mcp-textarea tm-mcp-textarea--code"
                        rows={3}
                        value={formatEnv(draft.env)}
                        onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
                      />
                    </div>
                  )}

                  {showPostgresFields ? (
                    <div className="tm-mcp-db-section">
                      <div className="tm-mcp-db-section-title">数据库连接（PostgreSQL）</div>
                      <div className="tm-mcp-db-grid">
                        <div className="tm-mcp-form-field">
                          <FormLabel required>地址</FormLabel>
                          <SettingsInput
                            value={db.dbHost}
                            placeholder="localhost"
                            onChange={(dbHost) => updateDbField({ dbHost })}
                          />
                        </div>
                        <div className="tm-mcp-form-field">
                          <FormLabel required>端口</FormLabel>
                          <SettingsInput
                            value={db.dbPort}
                            placeholder="5432"
                            onChange={(dbPort) => updateDbField({ dbPort })}
                          />
                        </div>
                        <div className="tm-mcp-form-field">
                          <FormLabel required>用户名</FormLabel>
                          <SettingsInput
                            value={db.dbUser}
                            placeholder="postgres"
                            onChange={(dbUser) => updateDbField({ dbUser })}
                          />
                        </div>
                        <div className="tm-mcp-form-field">
                          <FormLabel required>密码</FormLabel>
                          <SettingsInput
                            type="password"
                            value={db.dbPassword}
                            onChange={(dbPassword) => updateDbField({ dbPassword })}
                          />
                        </div>
                        <div className="tm-mcp-form-field tm-mcp-db-grid-full">
                          <FormLabel required>数据库名</FormLabel>
                          <SettingsInput
                            value={db.dbName}
                            placeholder="postgres"
                            onChange={(dbName) => updateDbField({ dbName })}
                          />
                        </div>
                      </div>
                      {!isPostgresMcpServer(draft) && !creating ? (
                        <p className="tm-mcp-db-hint">
                          填写连接信息后，保存时会自动写入 PostgreSQL MCP 启动参数。
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!isHttpTransport ? (
                    <div className="tm-mcp-form-field">
                      <FormLabel hint="格式为 KEY=value，每行一个">环境变量 (Environment Variables)</FormLabel>
                      <textarea
                        className="tm-mcp-textarea tm-mcp-textarea--code"
                        rows={3}
                        value={formatEnv(draft.env)}
                        placeholder={'KEY1=value1\nKEY2=value2'}
                        onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
                      />
                    </div>
                  ) : null}

                  <div className="tm-mcp-form-field tm-mcp-toggle-row">
                    <FormLabel hint="保持子进程持续运行">长时间运行模式</FormLabel>
                    <SettingsToggle
                      checked={draft.longRunning ?? false}
                      onChange={(longRunning) => onChange({ longRunning })}
                    />
                  </div>

                  <div className="tm-mcp-form-field">
                    <FormLabel hint="连接 MCP 服务器的超时时间">超时</FormLabel>
                    <div className="tm-mcp-timeout-input">
                      <SettingsInput
                        type="number"
                        min={1}
                        value={draft.timeoutSeconds ?? 60}
                        onChange={(value) =>
                          onChange({ timeoutSeconds: Math.max(1, Number(value) || 60) })
                        }
                      />
                      <span className="tm-mcp-timeout-suffix">s</span>
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                className="tm-mcp-advanced-toggle"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <span>高级设置</span>
                <IconChevronDown
                  size={14}
                  className={advancedOpen ? 'tm-mcp-chevron--open' : undefined}
                />
              </button>

              {advancedOpen ? (
                <div className="tm-mcp-advanced-panel">
                  <div className="tm-mcp-form-field">
                    <FormLabel>提供者</FormLabel>
                    <SettingsInput
                      value={draft.provider ?? ''}
                      placeholder="提供者名称"
                      onChange={(provider) => onChange({ provider })}
                    />
                  </div>
                  <div className="tm-mcp-form-field">
                    <FormLabel>提供者网址</FormLabel>
                    <SettingsInput
                      value={draft.providerUrl ?? ''}
                      placeholder="https://provider-website.com"
                      onChange={(providerUrl) => onChange({ providerUrl })}
                    />
                  </div>
                  <div className="tm-mcp-form-field">
                    <FormLabel>标志网址</FormLabel>
                    <SettingsInput
                      value={draft.logoUrl ?? ''}
                      placeholder="https://example.com/logo.png"
                      onChange={(logoUrl) => onChange({ logoUrl })}
                    />
                  </div>
                  <div className="tm-mcp-form-field">
                    <FormLabel>标签</FormLabel>
                    <SettingsInput
                      value={formatTags(draft.tags)}
                      placeholder="输入标签，逗号分隔"
                      onChange={(value) => onChange({ tags: parseTagsInput(value) })}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab !== 'general' ? (
            <div className="tm-mcp-inspect-panel">
              {tab === 'tools' ? (
                <div className="tm-mcp-inspect-list">
                  {inspectLoading ? <p className="tm-mcp-inspect-empty">加载中…</p> : null}
                  {!inspectLoading && tools.length === 0 ? (
                    <p className="tm-mcp-inspect-empty">暂无工具</p>
                  ) : null}
                  {tools.map((tool) => (
                    <div key={tool.name} className="tm-mcp-inspect-item">
                      <div className="tm-mcp-inspect-name">{tool.name}</div>
                      {tool.description ? (
                        <div className="tm-mcp-inspect-desc">{tool.description}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === 'prompts' ? (
                <div className="tm-mcp-inspect-list">
                  {inspectLoading ? <p className="tm-mcp-inspect-empty">加载中…</p> : null}
                  {!inspectLoading && prompts.length === 0 ? (
                    <p className="tm-mcp-inspect-empty">暂无提示</p>
                  ) : null}
                  {prompts.map((prompt) => (
                    <div key={prompt.name} className="tm-mcp-inspect-item">
                      <div className="tm-mcp-inspect-name">{prompt.name}</div>
                      {prompt.description ? (
                        <div className="tm-mcp-inspect-desc">{prompt.description}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === 'resources' ? (
                <div className="tm-mcp-inspect-list">
                  {inspectLoading ? <p className="tm-mcp-inspect-empty">加载中…</p> : null}
                  {!inspectLoading && resources.length === 0 ? (
                    <p className="tm-mcp-inspect-empty">暂无资源</p>
                  ) : null}
                  {resources.map((resource) => (
                    <div key={resource.uri} className="tm-mcp-inspect-item">
                      <div className="tm-mcp-inspect-name">{resource.name}</div>
                      <div className="tm-mcp-inspect-uri">{resource.uri}</div>
                      {resource.description ? (
                        <div className="tm-mcp-inspect-desc">{resource.description}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="tm-mcp-modal-footer">
          <div className="tm-mcp-modal-footer-actions">
            <button
              type="button"
              className="tm-mcp-modal-footer-btn tm-mcp-modal-footer-btn--secondary"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="tm-mcp-modal-footer-btn tm-mcp-modal-footer-btn--primary"
              onClick={onConfirm}
            >
              {creating ? '确认添加' : '保存设置'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export { EMPTY_STDIO_DRAFT, applyPackageSource }
