import { useState } from 'react'
import { IconEdit, IconPlus, IconTrash } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  addQuickPhrase,
  loadQuickPhrases,
  removeQuickPhrase,
  updateQuickPhrase,
  type QuickPhrase,
} from '../chat/quick-phrases'
import { SettingsInput, SettingsPageLayout, SettingsSection } from './SettingsShared'

interface EditModalProps {
  phrase: QuickPhrase | null
  onClose: () => void
  onSave: (data: { label: string; text: string }) => void
}

function QuickPhraseEditModal({ phrase, onClose, onSave }: EditModalProps) {
  const { t } = useI18n()
  const [label, setLabel] = useState(phrase?.label ?? '')
  const [text, setText] = useState(phrase?.text ?? '')

  const handleSave = () => {
    const trimmedText = text.trim()
    if (!trimmedText) return
    onSave({
      label: label.trim() || trimmedText.slice(0, 24),
      text: trimmedText,
    })
  }

  const title = phrase ? t('settings.quickPhrases.edit.title') : t('settings.quickPhrases.add.title')

  return (
    <div className="tm-modal-overlay tm-modal-overlay--channel-config" onClick={onClose}>
      <div
        className="tm-channel-config-modal tm-channel-config-modal--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-phrase-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-channel-config-header">
          <h3 className="tm-channel-config-title" id="quick-phrase-modal-title">
            <span className="tm-channel-config-title-dot" aria-hidden="true" />
            {title}
          </h3>
          <button
            type="button"
            className="tm-channel-config-close"
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

        <div className="tm-channel-config-body">
          <div className="tm-channel-config-field">
            <label className="tm-channel-config-label">{t('settings.quickPhrases.label')}</label>
            <SettingsInput
              value={label}
              placeholder={t('settings.quickPhrases.labelPlaceholder')}
              onChange={setLabel}
            />
          </div>

          <div className="tm-channel-config-field">
            <label className="tm-channel-config-label">
              {t('settings.quickPhrases.content')}
              <span className="tm-channel-config-required">*</span>
            </label>
            <textarea
              className="tm-channel-config-textarea"
              rows={5}
              value={text}
              placeholder={t('settings.quickPhrases.contentPlaceholder')}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <p className="tm-channel-config-field-hint">{t('settings.quickPhrases.hint')}</p>
        </div>

        <footer className="tm-channel-config-footer">
          <div className="tm-channel-config-footer-actions">
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--secondary"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--primary"
              disabled={!text.trim()}
              onClick={handleSave}
            >
              {t('common.save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function QuickPhrasesSettingsPanel() {
  const { t } = useI18n()
  const [phrases, setPhrases] = useState<QuickPhrase[]>(() => loadQuickPhrases())
  const [editingPhrase, setEditingPhrase] = useState<QuickPhrase | null | 'new'>(null)

  const handleSave = (data: { label: string; text: string }) => {
    if (editingPhrase && editingPhrase !== 'new') {
      setPhrases(updateQuickPhrase(editingPhrase.id, data))
    } else {
      setPhrases(addQuickPhrase(data.text, data.label))
    }
    setEditingPhrase(null)
  }

  const handleDelete = (phrase: QuickPhrase) => {
    if (!window.confirm(t('settings.quickPhrases.delete.confirm', { label: phrase.label }))) return
    setPhrases(removeQuickPhrase(phrase.id))
  }

  return (
    <>
      <SettingsPageLayout>
        <SettingsSection
          title={t('settings.quickPhrases.title')}
          intro={t('settings.quickPhrases.intro')}
          action={
            <button
              type="button"
              className="tm-mcp-add-btn"
              onClick={() => setEditingPhrase('new')}
            >
              <IconPlus size={14} />
              {t('common.add')}
            </button>
          }
        >
          {phrases.length === 0 ? (
            <p className="tm-quick-phrase-empty">{t('settings.quickPhrases.empty')}</p>
          ) : (
            phrases.map((phrase) => (
              <div key={phrase.id} className="tm-quick-phrase-row">
                <div className="tm-quick-phrase-row-main">
                  <div className="tm-quick-phrase-row-label">{phrase.label}</div>
                  <p className="tm-quick-phrase-row-text">{phrase.text}</p>
                </div>
                <div className="tm-quick-phrase-row-actions">
                  <button
                    type="button"
                    className="tm-provider-icon-btn"
                    title={t('settings.quickPhrases.edit.action')}
                    onClick={() => setEditingPhrase(phrase)}
                  >
                    <IconEdit size={14} />
                  </button>
                  <button
                    type="button"
                    className="tm-provider-icon-btn tm-provider-icon-btn--danger"
                    title={t('settings.quickPhrases.delete.action')}
                    onClick={() => handleDelete(phrase)}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </SettingsSection>
      </SettingsPageLayout>

      {editingPhrase !== null ? (
        <QuickPhraseEditModal
          phrase={editingPhrase === 'new' ? null : editingPhrase}
          onClose={() => setEditingPhrase(null)}
          onSave={handleSave}
        />
      ) : null}
    </>
  )
}
