import { useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  type McpPromptInfo,
  type McpResourceInfo,
  type McpServerConfig,
  type McpToolInfo,
} from '@toolman/shared'
import { LOCAL_DB_MCP_SERVER_ID } from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  buildPostgresArgs,
  isPostgresMcpServer,
  normalizeTransportType,
  resolveDbConnection,
} from './mcp-db-connection'
import { SettingsInput, SettingsSelect, SettingsToggle } from './SettingsShared'

type ModalTab = 'general' | 'tools' | 'prompts' | 'resources'

type CustomTransportType = 'stdio' | 'sse' | 'streamableHttp'

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
  const { t } = useI18n()
  const [tab, setTab] = useState<ModalTab>('general')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [tools, setTools] = useState<McpToolInfo[]>([])
  const [prompts, setPrompts] = useState<McpPromptInfo[]>([])
  const [resources, setResources] = useState<McpResourceInfo[]>([])

  const transportOptions = useMemo<Array<{ value: CustomTransportType; label: string }>>(
    () => [
      { value: 'stdio', label: t('settings.mcp.transport.stdio') },
      { value: 'sse', label: t('settings.mcp.transport.sse') },
      { value: 'streamableHttp', label: t('settings.mcp.transport.streamableHttp') },
    ],
    [t],
  )

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
    { id: 'general', label: t('settings.mcp.edit.tabs.general') },
    { id: 'tools', label: t('settings.mcp.edit.tabs.tools'), count: tools.length },
    { id: 'prompts', label: t('settings.mcp.edit.tabs.prompts'), count: prompts.length },
    { id: 'resources', label: t('settings.mcp.edit.tabs.resources'), count: resources.length },
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
            {creating ? t('settings.mcp.edit.addTitle') : draft.name}
          </h3>
          <button type="button" className="tm-mcp-modal-close" aria-label={t('common.close')} onClick={onCancel}>
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
                <div className="tm-mcp-info-banner">{t('settings.mcp.edit.sqliteBuiltinBanner')}</div>
              ) : null}

              <div className="tm-mcp-form-grid tm-mcp-form-grid--2">
                <div className="tm-mcp-form-field">
                  <FormLabel required>{t('settings.mcp.edit.name')}</FormLabel>
                  <SettingsInput
                    value={draft.name}
                    placeholder={t('settings.mcp.edit.namePlaceholder')}
                    onChange={(name) => onChange({ name })}
                  />
                </div>

                {isBuiltin ? (
                  <div className="tm-mcp-form-field">
                    <FormLabel>{t('settings.mcp.edit.type')}</FormLabel>
                    <SettingsInput value={t('settings.mcp.edit.typeBuiltin')} disabled onChange={() => undefined} />
                  </div>
                ) : (
                  <div className="tm-mcp-form-field">
                    <FormLabel required>{t('settings.mcp.edit.type')}</FormLabel>
                    <SettingsSelect
                      value={transportType}
                      options={transportOptions}
                      onChange={(type) => onChange({ type })}
                    />
                  </div>
                )}
              </div>

              <div className="tm-mcp-form-field">
                <FormLabel>{t('settings.mcp.edit.description')}</FormLabel>
                <SettingsInput
                  value={draft.description ?? ''}
                  placeholder={t('settings.mcp.edit.descriptionPlaceholder')}
                  onChange={(description) => onChange({ description })}
                />
              </div>

              {isBuiltin && (draft.builtinId ?? draft.id) === 'dify' ? (
                <div className="tm-mcp-form-field">
                  <FormLabel required hint={t('settings.mcp.edit.difyApiUrlHint')}>
                    {t('settings.mcp.edit.difyApiUrl')}
                  </FormLabel>
                  <SettingsInput
                    value={draft.providerUrl ?? 'https://api.dify.ai/v1'}
                    placeholder="https://api.dify.ai/v1"
                    onChange={(providerUrl) => onChange({ providerUrl })}
                  />
                </div>
              ) : null}

              {isBuiltin && (draft.builtinId ?? draft.id) === 'dify' ? (
                <div className="tm-mcp-form-field">
                  <FormLabel required hint={t('settings.mcp.edit.difyApiKeyHint')}>
                    {t('settings.mcp.edit.difyApiKey')}
                  </FormLabel>
                  <textarea
                    className="tm-mcp-textarea"
                    rows={2}
                    value={formatEnv(draft.env)}
                    placeholder={t('settings.mcp.edit.difyApiKeyPlaceholder')}
                    onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
                  />
                </div>
              ) : null}

              {isBuiltin ? null : (
                <>
                  {isHttpTransport ? (
                    <div className="tm-mcp-form-field">
                      <FormLabel required>{t('settings.mcp.edit.url')}</FormLabel>
                      <SettingsInput
                        value={draft.url ?? ''}
                        placeholder={t('settings.mcp.edit.urlPlaceholder')}
                        onChange={(url) => onChange({ url })}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="tm-mcp-form-field">
                        <FormLabel required>{t('settings.mcp.edit.command')}</FormLabel>
                        <input
                          className="tm-mcp-form-input tm-mcp-form-input--mono"
                          value={draft.command ?? ''}
                          placeholder={t('settings.mcp.edit.commandPlaceholder')}
                          onChange={(event) => onChange({ command: event.target.value })}
                        />
                      </div>

                      <div className="tm-mcp-form-field">
                        <FormLabel hint={t('settings.mcp.edit.packageSourceHint')}>
                          {t('settings.mcp.edit.packageSource')}
                        </FormLabel>
                        <div className="tm-mcp-package-source-group">
                          {(
                            [
                              { value: 'default', label: t('settings.mcp.edit.packageSourceDefault') },
                              { value: 'taobao', label: t('settings.mcp.edit.packageSourceTaobao') },
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
                            <span>{t('settings.mcp.edit.packageSourceCustom')}</span>
                          </label>
                        </div>
                      </div>

                      <div className="tm-mcp-form-field">
                        <FormLabel hint={t('settings.mcp.edit.argsHint')}>{t('settings.mcp.edit.args')}</FormLabel>
                        <textarea
                          className="tm-mcp-textarea tm-mcp-textarea--code"
                          rows={3}
                          value={(draft.args ?? []).join('\n')}
                          placeholder={t('settings.mcp.edit.argsPlaceholder')}
                          onChange={(e) => onChange({ args: parseArgsInput(e.target.value) })}
                        />
                      </div>
                    </>
                  )}

                  {!isHttpTransport ? null : (
                    <div className="tm-mcp-form-field">
                      <FormLabel hint={t('settings.mcp.edit.headersEnvHint')}>
                        {t('settings.mcp.edit.headersEnv')}
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
                      <div className="tm-mcp-db-section-title">{t('settings.mcp.edit.postgres.title')}</div>
                      <div className="tm-mcp-db-grid">
                        <div className="tm-mcp-form-field">
                          <FormLabel required>{t('settings.mcp.edit.postgres.host')}</FormLabel>
                          <SettingsInput
                            value={db.dbHost}
                            placeholder={t('settings.mcp.edit.postgres.hostPlaceholder')}
                            onChange={(dbHost) => updateDbField({ dbHost })}
                          />
                        </div>
                        <div className="tm-mcp-form-field">
                          <FormLabel required>{t('settings.mcp.edit.postgres.port')}</FormLabel>
                          <SettingsInput
                            value={db.dbPort}
                            placeholder={t('settings.mcp.edit.postgres.portPlaceholder')}
                            onChange={(dbPort) => updateDbField({ dbPort })}
                          />
                        </div>
                        <div className="tm-mcp-form-field">
                          <FormLabel required>{t('settings.mcp.edit.postgres.user')}</FormLabel>
                          <SettingsInput
                            value={db.dbUser}
                            placeholder={t('settings.mcp.edit.postgres.userPlaceholder')}
                            onChange={(dbUser) => updateDbField({ dbUser })}
                          />
                        </div>
                        <div className="tm-mcp-form-field">
                          <FormLabel required>{t('settings.mcp.edit.postgres.password')}</FormLabel>
                          <SettingsInput
                            type="password"
                            value={db.dbPassword}
                            onChange={(dbPassword) => updateDbField({ dbPassword })}
                          />
                        </div>
                        <div className="tm-mcp-form-field tm-mcp-db-grid-full">
                          <FormLabel required>{t('settings.mcp.edit.postgres.database')}</FormLabel>
                          <SettingsInput
                            value={db.dbName}
                            placeholder={t('settings.mcp.edit.postgres.databasePlaceholder')}
                            onChange={(dbName) => updateDbField({ dbName })}
                          />
                        </div>
                      </div>
                      {!isPostgresMcpServer(draft) && !creating ? (
                        <p className="tm-mcp-db-hint">{t('settings.mcp.edit.postgres.hint')}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {!isHttpTransport ? (
                    <div className="tm-mcp-form-field">
                      <FormLabel hint={t('settings.mcp.edit.envVarsHint')}>
                        {t('settings.mcp.edit.envVars')}
                      </FormLabel>
                      <textarea
                        className="tm-mcp-textarea tm-mcp-textarea--code"
                        rows={3}
                        value={formatEnv(draft.env)}
                        placeholder={t('settings.mcp.edit.envVarsPlaceholder')}
                        onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
                      />
                    </div>
                  ) : null}

                  <div className="tm-mcp-form-field tm-mcp-toggle-row">
                    <FormLabel hint={t('settings.mcp.edit.longRunningHint')}>
                      {t('settings.mcp.edit.longRunning')}
                    </FormLabel>
                    <SettingsToggle
                      checked={draft.longRunning ?? false}
                      onChange={(longRunning) => onChange({ longRunning })}
                    />
                  </div>

                  <div className="tm-mcp-form-field">
                    <FormLabel hint={t('settings.mcp.edit.timeoutHint')}>{t('settings.mcp.edit.timeout')}</FormLabel>
                    <div className="tm-mcp-timeout-input">
                      <SettingsInput
                        type="number"
                        min={1}
                        value={draft.timeoutSeconds ?? 60}
                        onChange={(value) =>
                          onChange({ timeoutSeconds: Math.max(1, Number(value) || 60) })
                        }
                      />
                      <span className="tm-mcp-timeout-suffix">{t('settings.mcp.edit.timeoutSuffix')}</span>
                    </div>
                  </div>
                </>
              )}

              <button
                type="button"
                className="tm-mcp-advanced-toggle"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <span>{t('settings.mcp.edit.advancedSettings')}</span>
                <IconChevronDown
                  size={14}
                  className={advancedOpen ? 'tm-mcp-chevron--open' : undefined}
                />
              </button>

              {advancedOpen ? (
                <div className="tm-mcp-advanced-panel">
                  <div className="tm-mcp-form-field">
                    <FormLabel>{t('settings.mcp.edit.provider')}</FormLabel>
                    <SettingsInput
                      value={draft.provider ?? ''}
                      placeholder={t('settings.mcp.edit.providerPlaceholder')}
                      onChange={(provider) => onChange({ provider })}
                    />
                  </div>
                  <div className="tm-mcp-form-field">
                    <FormLabel>{t('settings.mcp.edit.providerUrl')}</FormLabel>
                    <SettingsInput
                      value={draft.providerUrl ?? ''}
                      placeholder={t('settings.mcp.edit.providerUrlPlaceholder')}
                      onChange={(providerUrl) => onChange({ providerUrl })}
                    />
                  </div>
                  <div className="tm-mcp-form-field">
                    <FormLabel>{t('settings.mcp.edit.logoUrl')}</FormLabel>
                    <SettingsInput
                      value={draft.logoUrl ?? ''}
                      placeholder={t('settings.mcp.edit.logoUrlPlaceholder')}
                      onChange={(logoUrl) => onChange({ logoUrl })}
                    />
                  </div>
                  <div className="tm-mcp-form-field">
                    <FormLabel>{t('settings.mcp.edit.tags')}</FormLabel>
                    <SettingsInput
                      value={formatTags(draft.tags)}
                      placeholder={t('settings.mcp.edit.tagsPlaceholder')}
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
                  {inspectLoading ? (
                    <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.loading')}</p>
                  ) : null}
                  {!inspectLoading && tools.length === 0 ? (
                    <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.noTools')}</p>
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
                  {inspectLoading ? (
                    <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.loading')}</p>
                  ) : null}
                  {!inspectLoading && prompts.length === 0 ? (
                    <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.noPrompts')}</p>
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
                  {inspectLoading ? (
                    <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.loading')}</p>
                  ) : null}
                  {!inspectLoading && resources.length === 0 ? (
                    <p className="tm-mcp-inspect-empty">{t('settings.mcp.edit.inspect.noResources')}</p>
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
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-mcp-modal-footer-btn tm-mcp-modal-footer-btn--primary"
              onClick={onConfirm}
            >
              {creating ? t('settings.mcp.edit.confirmAdd') : t('settings.mcp.edit.save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export { EMPTY_STDIO_DRAFT, applyPackageSource }
