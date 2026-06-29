import { KnowledgeBaseSettingsModalContent } from './KnowledgeBaseSettingsModalContent'
import type { KnowledgeBaseSettingsModalProps } from './knowledge-base-settings-types'
import { useKnowledgeBaseSettingsModal } from './useKnowledgeBaseSettingsModal'

export function KnowledgeBaseSettingsModal(props: KnowledgeBaseSettingsModalProps) {
  const { onClose, nameReadOnly } = props
  const state = useKnowledgeBaseSettingsModal(props)
  const {
    t,
    submitting,
    activeTab,
    setActiveTab,
    footerErrorRef,
    combinedError,
    modalTitle,
    settingsTabs,
    handleSubmit,
  } = state

  return (
    <div className="tm-modal-overlay tm-modal-overlay--kb-settings" onClick={onClose}>
      <div
        className="tm-kb-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-kb-settings-modal-header">
          <h3 id="kb-settings-title" className="tm-kb-settings-modal-title">
            <span className="tm-kb-settings-modal-title-dot" aria-hidden="true" />
            {modalTitle}
          </h3>
          <button
            type="button"
            className="tm-kb-settings-modal-close"
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

        <div className="tm-kb-settings-modal-body">
          <nav
            className="tm-kb-settings-modal-nav"
            aria-label={t('knowledgePage.settingsTitle', { title: t('modules.knowledge.title') })}
          >
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-kb-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-kb-settings-modal-nav-item--active' : '',
                  tab.badge ? 'tm-kb-settings-modal-nav-item--badge' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.badge ? <span className="tm-kb-settings-nav-badge">{tab.badge}</span> : null}
              </button>
            ))}
          </nav>

          <div className="tm-kb-settings-modal-content">
            <KnowledgeBaseSettingsModalContent {...state} nameReadOnly={nameReadOnly} />
          </div>
        </div>

        <footer className="tm-kb-settings-modal-footer">
          {combinedError ? (
            <p ref={footerErrorRef} className="tm-form-error tm-kb-settings-modal-footer-error">
              {combinedError}
            </p>
          ) : null}
          <div className="tm-kb-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
              onClick={onClose}
              disabled={submitting}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? t('common.loading') : t('knowledgePage.settings.saveConfig')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
