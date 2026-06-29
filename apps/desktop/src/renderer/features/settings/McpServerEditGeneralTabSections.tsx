import type { McpServerConfig } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { McpServerEditFormLabel } from './McpServerEditFormLabel'
import { SettingsInput } from './SettingsShared'
import { formatTags, parseTagsInput } from './mcp-server-edit-utils'
import { isPostgresMcpServer } from './mcp-db-connection'

interface PostgresSectionProps {
  t: TranslateFn
  db: {
    dbHost: string
    dbPort: string
    dbUser: string
    dbPassword: string
    dbName: string
  }
  draft: McpServerConfig
  creating: boolean
  onUpdateDbField: (patch: Partial<McpServerConfig>) => void
}

export function McpServerEditPostgresSection({
  t,
  db,
  draft,
  creating,
  onUpdateDbField,
}: PostgresSectionProps) {
  return (
    <div className="tm-mcp-db-section">
      <div className="tm-mcp-db-section-title">{t('settings.mcp.edit.postgres.title')}</div>
      <div className="tm-mcp-db-grid">
        <div className="tm-mcp-form-field">
          <McpServerEditFormLabel required>{t('settings.mcp.edit.postgres.host')}</McpServerEditFormLabel>
          <SettingsInput
            value={db.dbHost}
            placeholder={t('settings.mcp.edit.postgres.hostPlaceholder')}
            onChange={(dbHost) => onUpdateDbField({ dbHost })}
          />
        </div>
        <div className="tm-mcp-form-field">
          <McpServerEditFormLabel required>{t('settings.mcp.edit.postgres.port')}</McpServerEditFormLabel>
          <SettingsInput
            value={db.dbPort}
            placeholder={t('settings.mcp.edit.postgres.portPlaceholder')}
            onChange={(dbPort) => onUpdateDbField({ dbPort })}
          />
        </div>
        <div className="tm-mcp-form-field">
          <McpServerEditFormLabel required>{t('settings.mcp.edit.postgres.user')}</McpServerEditFormLabel>
          <SettingsInput
            value={db.dbUser}
            placeholder={t('settings.mcp.edit.postgres.userPlaceholder')}
            onChange={(dbUser) => onUpdateDbField({ dbUser })}
          />
        </div>
        <div className="tm-mcp-form-field">
          <McpServerEditFormLabel required>{t('settings.mcp.edit.postgres.password')}</McpServerEditFormLabel>
          <SettingsInput
            type="password"
            value={db.dbPassword}
            onChange={(dbPassword) => onUpdateDbField({ dbPassword })}
          />
        </div>
        <div className="tm-mcp-form-field tm-mcp-db-grid-full">
          <McpServerEditFormLabel required>{t('settings.mcp.edit.postgres.database')}</McpServerEditFormLabel>
          <SettingsInput
            value={db.dbName}
            placeholder={t('settings.mcp.edit.postgres.databasePlaceholder')}
            onChange={(dbName) => onUpdateDbField({ dbName })}
          />
        </div>
      </div>
      {!isPostgresMcpServer(draft) && !creating ? (
        <p className="tm-mcp-db-hint">{t('settings.mcp.edit.postgres.hint')}</p>
      ) : null}
    </div>
  )
}

interface AdvancedPanelProps {
  t: TranslateFn
  draft: McpServerConfig
  onChange: (patch: Partial<McpServerConfig>) => void
}

export function McpServerEditAdvancedPanel({ t, draft, onChange }: AdvancedPanelProps) {
  return (
    <div className="tm-mcp-advanced-panel">
      <div className="tm-mcp-form-field">
        <McpServerEditFormLabel>{t('settings.mcp.edit.provider')}</McpServerEditFormLabel>
        <SettingsInput
          value={draft.provider ?? ''}
          placeholder={t('settings.mcp.edit.providerPlaceholder')}
          onChange={(provider) => onChange({ provider })}
        />
      </div>
      <div className="tm-mcp-form-field">
        <McpServerEditFormLabel>{t('settings.mcp.edit.providerUrl')}</McpServerEditFormLabel>
        <SettingsInput
          value={draft.providerUrl ?? ''}
          placeholder={t('settings.mcp.edit.providerUrlPlaceholder')}
          onChange={(providerUrl) => onChange({ providerUrl })}
        />
      </div>
      <div className="tm-mcp-form-field">
        <McpServerEditFormLabel>{t('settings.mcp.edit.logoUrl')}</McpServerEditFormLabel>
        <SettingsInput
          value={draft.logoUrl ?? ''}
          placeholder={t('settings.mcp.edit.logoUrlPlaceholder')}
          onChange={(logoUrl) => onChange({ logoUrl })}
        />
      </div>
      <div className="tm-mcp-form-field">
        <McpServerEditFormLabel>{t('settings.mcp.edit.tags')}</McpServerEditFormLabel>
        <SettingsInput
          value={formatTags(draft.tags)}
          placeholder={t('settings.mcp.edit.tagsPlaceholder')}
          onChange={(value) => onChange({ tags: parseTagsInput(value) })}
        />
      </div>
    </div>
  )
}
