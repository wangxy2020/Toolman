import { useMemo, useState } from 'react'
import type { Provider, TranslationLanguage } from '@toolman/shared'
import {
  buildModelOptions,
  formatModelDisplayLabel,
  isModelIdAvailable,
} from '../chat/model-utils'
import { TRANSLATION_LANGUAGE_OPTIONS } from '../chat/translation-utils'
import { NotesSettingsToggle } from '../notes/notes-settings-modal-components'
import { useI18n } from '../../i18n/useI18n'
import { pickPreferredTranslationModelId } from './resolve-translation-model-id'
import {
  normalizeTranslationSettings,
  type TranslationSettings,
} from './translation-settings-storage'

type SettingsTab = 'general' | 'document'

const SETTINGS_TABS: { id: SettingsTab; labelKey: 'general' | 'document' }[] = [
  { id: 'general', labelKey: 'general' },
  { id: 'document', labelKey: 'document' },
]

interface Props {
  settings: TranslationSettings
  providers: Provider[]
  onClose: () => void
  onSave: (settings: TranslationSettings) => void
}

export function TranslationSettingsModal({
  settings,
  providers,
  onClose,
  onSave,
}: Props) {
  const { t } = useI18n()
  const modelOptions = useMemo(
    () =>
      buildModelOptions(providers).filter((option) =>
        isModelIdAvailable(option.modelId, providers),
      ),
    [providers],
  )
  const preferredModelId = useMemo(
    () => pickPreferredTranslationModelId(providers),
    [providers],
  )

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [draft, setDraft] = useState<TranslationSettings>(() => {
    const normalized = normalizeTranslationSettings(settings)
    const modelId =
      normalized.modelId &&
      modelOptions.some((option) => option.modelId === normalized.modelId)
        ? normalized.modelId
        : preferredModelId
    return { ...normalized, modelId }
  })

  const baseline = useMemo(() => {
    const normalized = normalizeTranslationSettings(settings)
    const modelId =
      normalized.modelId &&
      modelOptions.some((option) => option.modelId === normalized.modelId)
        ? normalized.modelId
        : preferredModelId
    return normalizeTranslationSettings({ ...normalized, modelId })
  }, [modelOptions, preferredModelId, settings])

  const selectModelId =
    draft.modelId && modelOptions.some((option) => option.modelId === draft.modelId)
      ? draft.modelId
      : preferredModelId ?? modelOptions[0]?.modelId ?? ''

  const dirty = useMemo(() => {
    const next = normalizeTranslationSettings({
      ...draft,
      modelId: selectModelId || preferredModelId,
    })
    return JSON.stringify(next) !== JSON.stringify(baseline)
  }, [baseline, draft, preferredModelId, selectModelId])

  const updateLanguage = (index: 0 | 1, value: TranslationLanguage) => {
    setDraft((prev) => {
      const languages: [TranslationLanguage, TranslationLanguage] = [...prev.languages]
      languages[index] = value
      if (languages[0] === languages[1]) {
        languages[1] = value === 'zh' ? 'en' : 'zh'
      }
      return { ...prev, languages }
    })
  }

  const handleSave = () => {
    const modelId = selectModelId || preferredModelId
    if (!modelId) return
    onSave(normalizeTranslationSettings({ ...draft, modelId }))
    onClose()
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--translation-settings" onClick={onClose}>
      <div
        className="tm-translation-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="translation-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-translation-settings-modal-header">
          <h3 id="translation-settings-title" className="tm-translation-settings-modal-title">
            <span className="tm-translation-settings-modal-title-dot" aria-hidden="true" />
            {t('translationPage.settings.modalTitle')}
          </h3>
          <button
            type="button"
            className="tm-translation-settings-modal-close"
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

        <div className="tm-translation-settings-modal-body">
          <nav
            className="tm-translation-settings-modal-nav"
            aria-label={t('translationPage.settingsNavAria')}
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-translation-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-translation-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                {t(`translationPage.settings.tabs.${tab.labelKey}`)}
              </button>
            ))}
          </nav>

          <div className="tm-translation-settings-modal-content">
            {activeTab === 'general' ? (
              <div className="tm-notes-settings-form">
                <div className="tm-notes-settings-field-block">
                  <div className="tm-notes-settings-row tm-notes-settings-row--inline">
                    <label className="tm-notes-settings-label" htmlFor="translation-settings-model">
                      {t('translationPage.settings.model')}
                    </label>
                    <select
                      id="translation-settings-model"
                      className="tm-notes-settings-input tm-notes-settings-input--compact"
                      title={
                        selectModelId
                          ? formatModelDisplayLabel(selectModelId, providers)
                          : t('translationPage.settings.modelNone')
                      }
                      value={selectModelId}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          modelId: event.target.value.trim() || null,
                        }))
                      }
                      disabled={modelOptions.length === 0}
                    >
                      {modelOptions.length === 0 ? (
                        <option value="">{t('translationPage.settings.modelNone')}</option>
                      ) : (
                        modelOptions.map((option) => (
                          <option key={option.modelId} value={option.modelId}>
                            {formatModelDisplayLabel(option.modelId, providers)}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <p className="tm-notes-settings-hint">{t('translationPage.settings.modelHint')}</p>
                </div>

                <div className="tm-notes-settings-field-block">
                  <span className="tm-notes-settings-label">
                    {t('translationPage.settings.languages')}
                  </span>
                  <div className="tm-translation-settings-langs">
                    <select
                      className="tm-notes-settings-input"
                      aria-label={t('translationPage.settings.sourceLanguage')}
                      value={draft.languages[0]}
                      onChange={(event) =>
                        updateLanguage(0, event.target.value as TranslationLanguage)
                      }
                    >
                      {TRANSLATION_LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(`agent.languages.${option.value}`)}
                        </option>
                      ))}
                    </select>
                    <span className="tm-translation-settings-langs-sep" aria-hidden="true">
                      ↔
                    </span>
                    <select
                      className="tm-notes-settings-input"
                      aria-label={t('translationPage.settings.targetLanguage')}
                      value={draft.languages[1]}
                      onChange={(event) =>
                        updateLanguage(1, event.target.value as TranslationLanguage)
                      }
                    >
                      {TRANSLATION_LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(`agent.languages.${option.value}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="tm-notes-settings-hint">
                    {t('translationPage.settings.languagesHint')}
                  </p>
                </div>

                <div className="tm-notes-settings-toggle-card">
                  <div className="tm-notes-settings-toggle-item">
                    <div className="tm-notes-settings-toggle-copy">
                      <span className="tm-notes-settings-toggle-label">
                        {t('translationPage.settings.autoDetectSource')}
                      </span>
                      <p className="tm-notes-settings-hint">
                        {t('translationPage.settings.autoDetectSourceHint')}
                      </p>
                    </div>
                    <NotesSettingsToggle
                      checked={draft.autoDetectSource}
                      onChange={(autoDetectSource) =>
                        setDraft((prev) => ({ ...prev, autoDetectSource }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === 'document' ? (
              <div className="tm-notes-settings-form">
                <div className="tm-notes-settings-field-block">
                  <div className="tm-notes-settings-row tm-notes-settings-row--inline">
                    <label
                      className="tm-notes-settings-label"
                      htmlFor="translation-settings-pdf-parser"
                    >
                      {t('translationPage.settings.pdfParserBackend')}
                    </label>
                    <select
                      id="translation-settings-pdf-parser"
                      className="tm-notes-settings-input tm-notes-settings-input--compact"
                      value={draft.pdfParserBackend}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          pdfParserBackend:
                            event.target.value === 'opendataloader' ? 'opendataloader' : 'builtin',
                        }))
                      }
                    >
                      <option value="opendataloader">
                        {t('translationPage.settings.pdfParserOpenDataLoader')}
                      </option>
                      <option value="builtin">
                        {t('translationPage.settings.pdfParserBuiltin')}
                      </option>
                    </select>
                  </div>
                  <p className="tm-notes-settings-hint">
                    {t('translationPage.settings.pdfParserHint')}
                  </p>
                </div>

                <div className="tm-notes-settings-toggle-card">
                  <div className="tm-notes-settings-toggle-item">
                    <div className="tm-notes-settings-toggle-copy">
                      <span className="tm-notes-settings-toggle-label">
                        {t('translationPage.settings.autoSaveAfterTranslate')}
                      </span>
                      <p className="tm-notes-settings-hint">
                        {t('translationPage.settings.autoSaveAfterTranslateHint')}
                      </p>
                    </div>
                    <NotesSettingsToggle
                      checked={draft.autoSaveAfterTranslate}
                      onChange={(autoSaveAfterTranslate) =>
                        setDraft((prev) => ({ ...prev, autoSaveAfterTranslate }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="tm-translation-settings-modal-footer">
          <div className="tm-translation-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-translation-settings-modal-footer-btn tm-translation-settings-modal-footer-btn--secondary"
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="tm-translation-settings-modal-footer-btn tm-translation-settings-modal-footer-btn--primary"
              onClick={handleSave}
              disabled={!selectModelId || !dirty}
            >
              {t('translationPage.settings.save')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
