import type { McpServerConfig } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { McpServerEditGeneralTab } from './McpServerEditGeneralTab'
import { McpServerEditInspectTab } from './McpServerEditInspectTab'
import { useMcpServerEditModal } from './useMcpServerEditModal'

interface Props {
  draft: McpServerConfig
  creating: boolean
  onChange: (patch: Partial<McpServerConfig>) => void
  onCancel: () => void
  onConfirm: () => void
}

export function McpServerEditModal({ draft, creating, onChange, onCancel, onConfirm }: Props) {
  const { t } = useI18n()
  const modal = useMcpServerEditModal(draft, creating)

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
          {modal.tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tm-mcp-modal-tab ${modal.tab === item.id ? 'tm-mcp-modal-tab--active' : ''}`}
              onClick={() => modal.setTab(item.id)}
            >
              {item.label}
              {item.count != null ? (
                <span className="tm-mcp-modal-tab-count">({item.count})</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="tm-mcp-modal-body">
          {modal.tab === 'general' ? (
            <McpServerEditGeneralTab
              draft={draft}
              creating={creating}
              advancedOpen={modal.advancedOpen}
              onAdvancedOpenChange={modal.setAdvancedOpen}
              onChange={onChange}
            />
          ) : (
            <McpServerEditInspectTab
              tab={modal.tab}
              inspectLoading={modal.inspectLoading}
              tools={modal.tools}
              prompts={modal.prompts}
              resources={modal.resources}
            />
          )}
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

export { EMPTY_STDIO_DRAFT, applyPackageSource } from './mcp-server-edit-utils'
