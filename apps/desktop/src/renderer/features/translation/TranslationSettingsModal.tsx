import { useMemo, useState } from 'react'
import type { Provider, TranslationLanguage } from '@toolman/shared'
import {
  AgentSettingsHelpHint,
  AgentSettingsToggle,
} from '../chat/agent-settings-modal-components'
import {
  buildModelOptions,
  formatModelDisplayLabel,
  isModelIdAvailable,
} from '../chat/model-utils'
import { TRANSLATION_LANGUAGE_OPTIONS } from '../chat/translation-utils'
import { useI18n } from '../../i18n/useI18n'
import { pickPreferredTranslationModelId } from './resolve-translation-model-id'
import {
  normalizeTranslationSettings,
  type TranslationSettings,
} from './translation-settings-storage'

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

  const [draft, setDraft] = useState<TranslationSettings>(() => {
    const normalized = normalizeTranslationSettings(settings)
    const modelId =
      normalized.modelId &&
      modelOptions.some((option) => option.modelId === normalized.modelId)
        ? normalized.modelId
        : preferredModelId
    return { ...normalized, modelId }
  })

  const selectModelId =
    draft.modelId && modelOptions.some((option) => option.modelId === draft.modelId)
      ? draft.modelId
      : preferredModelId ?? modelOptions[0]?.modelId ?? ''

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
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal tm-agent-modal--create tm-agent-modal--translation-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="translation-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="translation-settings-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('translationPage.settings.modalTitle')}
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

        <div className="tm-agent-modal-body tm-agent-modal-body--single">
          <div className="tm-agent-modal-content">
            <div className="tm-agent-settings-form tm-translation-settings-form">
              <div className="tm-agent-setting-row">
                <div className="tm-agent-setting-label-group">
                  <label className="tm-agent-setting-label" htmlFor="translation-settings-model">
                    {t('translationPage.settings.model')}
                  </label>
                  <AgentSettingsHelpHint title={t('translationPage.settings.modelHint')} />
                </div>
                <div className="tm-translation-settings-control">
                  <select
                    id="translation-settings-model"
                    className="tm-agent-model-select"
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
              </div>

              <div className="tm-agent-setting-row">
                <div className="tm-agent-setting-label-group">
                  <span className="tm-agent-setting-label">
                    {t('translationPage.settings.languages')}
                  </span>
                  <AgentSettingsHelpHint title={t('translationPage.settings.languagesHint')} />
                </div>
                <div className="tm-translation-settings-control">
                  <div className="tm-agent-translation-langs">
                    <select
                      className="tm-agent-model-select"
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
                    <span className="tm-agent-translation-sep">↔</span>
                    <select
                      className="tm-agent-model-select"
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
                </div>
              </div>

              <div className="tm-agent-setting-row">
                <div className="tm-agent-setting-label-group">
                  <span className="tm-agent-setting-label">
                    {t('translationPage.settings.autoDetectSource')}
                  </span>
                  <AgentSettingsHelpHint title={t('translationPage.settings.autoDetectSourceHint')} />
                </div>
                <div className="tm-translation-settings-control tm-translation-settings-control--toggle">
                  <AgentSettingsToggle
                    checked={draft.autoDetectSource}
                    onChange={(checked) =>
                      setDraft((prev) => ({ ...prev, autoDetectSource: checked }))
                    }
                  />
                </div>
              </div>

              <div className="tm-agent-setting-row">
                <div className="tm-agent-setting-label-group">
                  <span className="tm-agent-setting-label">
                    {t('translationPage.settings.autoSaveAfterTranslate')}
                  </span>
                  <AgentSettingsHelpHint
                    title={t('translationPage.settings.autoSaveAfterTranslateHint')}
                  />
                </div>
                <div className="tm-translation-settings-control tm-translation-settings-control--toggle">
                  <AgentSettingsToggle
                    checked={draft.autoSaveAfterTranslate}
                    onChange={(checked) =>
                      setDraft((prev) => ({ ...prev, autoSaveAfterTranslate: checked }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            onClick={handleSave}
            disabled={!selectModelId}
          >
            {t('translationPage.settings.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}
