import { useMemo } from 'react'
import { LOCAL_DB_MCP_SERVER_ID, type McpServerConfig } from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  buildPostgresArgs,
  isPostgresMcpServer,
  normalizeTransportType,
  resolveDbConnection,
} from './mcp-db-connection'
import { SettingsInput, SettingsSelect, SettingsToggle } from './SettingsShared'
import { McpServerEditFormLabel } from './McpServerEditFormLabel'
import {
  McpServerEditAdvancedPanel,
  McpServerEditPostgresSection,
} from './McpServerEditGeneralTabSections'
import {
  formatEnv,
  parseArgsInput,
  parseEnvInput,
} from './mcp-server-edit-utils'

type CustomTransportType = 'stdio' | 'sse' | 'streamableHttp'

interface Props {
  draft: McpServerConfig
  creating: boolean
  advancedOpen: boolean
  onAdvancedOpenChange: (open: boolean) => void
  onChange: (patch: Partial<McpServerConfig>) => void
}

export function McpServerEditGeneralTab({
  draft,
  creating,
  advancedOpen,
  onAdvancedOpenChange,
  onChange,
}: Props) {
  const { t } = useI18n()

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

  const updateDbField = (patch: Partial<McpServerConfig>) => {
    const next = { ...draft, ...patch }
    onChange({
      ...patch,
      args: buildPostgresArgs(next),
    })
  }

  return (
    <div className="tm-mcp-general-panel">
      {isSqliteBuiltin ? (
        <div className="tm-mcp-info-banner">{t('settings.mcp.edit.sqliteBuiltinBanner')}</div>
      ) : null}

      <div className="tm-mcp-form-grid tm-mcp-form-grid--2">
        <div className="tm-mcp-form-field">
          <McpServerEditFormLabel required>{t('settings.mcp.edit.name')}</McpServerEditFormLabel>
          <SettingsInput
            value={draft.name}
            placeholder={t('settings.mcp.edit.namePlaceholder')}
            onChange={(name) => onChange({ name })}
          />
        </div>

        {isBuiltin ? (
          <div className="tm-mcp-form-field">
            <McpServerEditFormLabel>{t('settings.mcp.edit.type')}</McpServerEditFormLabel>
            <SettingsInput value={t('settings.mcp.edit.typeBuiltin')} disabled onChange={() => undefined} />
          </div>
        ) : (
          <div className="tm-mcp-form-field">
            <McpServerEditFormLabel required>{t('settings.mcp.edit.type')}</McpServerEditFormLabel>
            <SettingsSelect
              value={transportType}
              options={transportOptions}
              onChange={(type) => onChange({ type })}
            />
          </div>
        )}
      </div>

      <div className="tm-mcp-form-field">
        <McpServerEditFormLabel>{t('settings.mcp.edit.description')}</McpServerEditFormLabel>
        <SettingsInput
          value={draft.description ?? ''}
          placeholder={t('settings.mcp.edit.descriptionPlaceholder')}
          onChange={(description) => onChange({ description })}
        />
      </div>

      {isBuiltin && (draft.builtinId ?? draft.id) === 'dify' ? (
        <>
          <div className="tm-mcp-form-field">
            <McpServerEditFormLabel required hint={t('settings.mcp.edit.difyApiUrlHint')}>
              {t('settings.mcp.edit.difyApiUrl')}
            </McpServerEditFormLabel>
            <SettingsInput
              value={draft.providerUrl ?? 'https://api.dify.ai/v1'}
              placeholder="https://api.dify.ai/v1"
              onChange={(providerUrl) => onChange({ providerUrl })}
            />
          </div>
          <div className="tm-mcp-form-field">
            <McpServerEditFormLabel required hint={t('settings.mcp.edit.difyApiKeyHint')}>
              {t('settings.mcp.edit.difyApiKey')}
            </McpServerEditFormLabel>
            <textarea
              className="tm-mcp-textarea"
              rows={2}
              value={formatEnv(draft.env)}
              placeholder={t('settings.mcp.edit.difyApiKeyPlaceholder')}
              onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
            />
          </div>
        </>
      ) : null}

      {isBuiltin ? null : (
        <>
          {isHttpTransport ? (
            <div className="tm-mcp-form-field">
              <McpServerEditFormLabel required>{t('settings.mcp.edit.url')}</McpServerEditFormLabel>
              <SettingsInput
                value={draft.url ?? ''}
                placeholder={t('settings.mcp.edit.urlPlaceholder')}
                onChange={(url) => onChange({ url })}
              />
            </div>
          ) : (
            <>
              <div className="tm-mcp-form-field">
                <McpServerEditFormLabel required>{t('settings.mcp.edit.command')}</McpServerEditFormLabel>
                <input
                  className="tm-mcp-form-input tm-mcp-form-input--mono"
                  value={draft.command ?? ''}
                  placeholder={t('settings.mcp.edit.commandPlaceholder')}
                  onChange={(event) => onChange({ command: event.target.value })}
                />
              </div>

              <div className="tm-mcp-form-field">
                <McpServerEditFormLabel hint={t('settings.mcp.edit.packageSourceHint')}>
                  {t('settings.mcp.edit.packageSource')}
                </McpServerEditFormLabel>
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
                <McpServerEditFormLabel hint={t('settings.mcp.edit.argsHint')}>
                  {t('settings.mcp.edit.args')}
                </McpServerEditFormLabel>
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

          {isHttpTransport ? (
            <div className="tm-mcp-form-field">
              <McpServerEditFormLabel hint={t('settings.mcp.edit.headersEnvHint')}>
                {t('settings.mcp.edit.headersEnv')}
              </McpServerEditFormLabel>
              <textarea
                className="tm-mcp-textarea tm-mcp-textarea--code"
                rows={3}
                value={formatEnv(draft.env)}
                onChange={(e) => onChange({ env: parseEnvInput(e.target.value) })}
              />
            </div>
          ) : null}

          {showPostgresFields ? (
            <McpServerEditPostgresSection
              t={t}
              db={db}
              draft={draft}
              creating={creating}
              onUpdateDbField={updateDbField}
            />
          ) : null}

          {!isHttpTransport ? (
            <div className="tm-mcp-form-field">
              <McpServerEditFormLabel hint={t('settings.mcp.edit.envVarsHint')}>
                {t('settings.mcp.edit.envVars')}
              </McpServerEditFormLabel>
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
            <McpServerEditFormLabel hint={t('settings.mcp.edit.longRunningHint')}>
              {t('settings.mcp.edit.longRunning')}
            </McpServerEditFormLabel>
            <SettingsToggle
              checked={draft.longRunning ?? false}
              onChange={(longRunning) => onChange({ longRunning })}
            />
          </div>

          <div className="tm-mcp-form-field">
            <McpServerEditFormLabel hint={t('settings.mcp.edit.timeoutHint')}>
              {t('settings.mcp.edit.timeout')}
            </McpServerEditFormLabel>
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
        onClick={() => onAdvancedOpenChange(!advancedOpen)}
      >
        <span>{t('settings.mcp.edit.advancedSettings')}</span>
        <IconChevronDown
          size={14}
          className={advancedOpen ? 'tm-mcp-chevron--open' : undefined}
        />
      </button>

      {advancedOpen ? (
        <McpServerEditAdvancedPanel t={t} draft={draft} onChange={onChange} />
      ) : null}
    </div>
  )
}
