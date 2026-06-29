import { AgentSettingsModalContent } from './AgentSettingsModalContent'
import type { AgentSettingsModalProps } from './agent-settings-modal-types'
import { useAgentSettingsModal } from './useAgentSettingsModal'

export function AgentSettingsModal(props: AgentSettingsModalProps) {
  const { onClose } = props
  const state = useAgentSettingsModal(props)
  const { t, activeTab, setActiveTab, tabs, settingsTitleName, busy, handleSaveAndClose } = state

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="agent-settings-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('agent.settingsTitle', { name: settingsTitleName })}
          </h3>
          <button
            type="button"
            className="tm-agent-modal-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
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

        <div className="tm-agent-modal-body">
          <nav className="tm-agent-modal-nav" aria-label={t('agent.settingsNavAria')}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`tm-agent-modal-nav-item ${activeTab === tab.id ? 'tm-agent-modal-nav-item--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tm-agent-modal-content">
            <AgentSettingsModalContent activeTab={activeTab} state={state} />
            {busy ? <div className="tm-agent-saving">{t('agent.saving')}</div> : null}
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            disabled={busy}
            onClick={() => void handleSaveAndClose(onClose)}
          >
            {t('agent.saveSettings')}
          </button>
        </footer>
      </div>
    </div>
  )
}
