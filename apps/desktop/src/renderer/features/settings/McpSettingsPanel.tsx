import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { McpServerEditModal } from './McpServerEditModal'
import { McpServerRow } from './McpServerRow'
import { SettingsPageLayout, SettingsSection } from './SettingsShared'
import { useMcpSettingsPanel } from './useMcpSettingsPanel'

export function McpSettingsPanel() {
  const { t } = useI18n()
  const panel = useMcpSettingsPanel()

  return (
    <>
      <SettingsPageLayout>
        {panel.error ? <div className="tm-settings-error">{panel.error}</div> : null}
        {panel.loading ? <div className="tm-settings-loading">{t('common.loading')}</div> : null}

        {panel.groupedServers.map((category) => (
          <SettingsSection
            key={category.id}
            title={category.title}
            intro={category.description}
            action={
              category.id === 'servers' ? (
                <button type="button" className="tm-mcp-add-btn" onClick={panel.openCreate}>
                  <IconPlus size={14} />
                  {t('common.add')}
                </button>
              ) : undefined
            }
          >
            {category.servers.length > 0 ? (
              <div className="tm-mcp-server-list">
                {category.servers.map((server) => (
                  <McpServerRow
                    key={server.id}
                    server={server}
                    status={panel.getStatusLabel(server)}
                    testLabel={panel.testResults[server.id]}
                    testing={panel.testingId === server.id}
                    onEdit={panel.openEdit}
                    onDelete={panel.handleDelete}
                    onTest={panel.handleTest}
                    onToggle={panel.handleToggle}
                  />
                ))}
              </div>
            ) : category.id === 'custom' ? (
              <div className="tm-mcp-empty-hint">{t('settings.mcp.custom.empty')}</div>
            ) : null}
          </SettingsSection>
        ))}
      </SettingsPageLayout>

      {panel.modalOpen ? (
        <McpServerEditModal
          draft={panel.draft}
          creating={panel.creating}
          onChange={panel.handleDraftChange}
          onCancel={panel.cancelModal}
          onConfirm={panel.confirmModal}
        />
      ) : null}
    </>
  )
}
