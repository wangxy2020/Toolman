import { useEffect, useState } from 'react'

import { IconChevronRight, IconSliders } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import type { MessageSettings } from './message-settings'
import {
  MessageSettingsCodeSection,
  MessageSettingsInputSection,
  MessageSettingsMathSection,
  MessageSettingsMessagesSection,
} from './MessageSettingsPanelSections'

interface Props {
  settings: MessageSettings
  onChange: (patch: Partial<MessageSettings>) => void
  onReset: () => void
  onClose: () => void
}

export function MessageSettingsPanel({ settings, onChange, onReset, onClose }: Props) {
  const { t } = useI18n()
  const [messageOpen, setMessageOpen] = useState(true)
  const [mathOpen, setMathOpen] = useState(true)
  const [codeOpen, setCodeOpen] = useState(true)
  const [inputOpen, setInputOpen] = useState(true)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sectionProps = { settings, onChange }

  return (
    <div className="tm-message-settings-overlay" onClick={onClose}>
      <aside className="tm-message-settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="tm-message-settings-header">
          <div className="tm-message-settings-header-title">
            <IconSliders size={16} />
            <h3>{t('chat.systemPreferences')}</h3>
          </div>
          <button
            type="button"
            className="tm-message-settings-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <IconChevronRight size={16} />
          </button>
        </header>

        <div className="tm-message-settings-scroll">
          <MessageSettingsMessagesSection
            {...sectionProps}
            open={messageOpen}
            onToggle={() => setMessageOpen((v) => !v)}
          />
          <MessageSettingsMathSection
            {...sectionProps}
            open={mathOpen}
            onToggle={() => setMathOpen((v) => !v)}
          />
          <MessageSettingsCodeSection
            {...sectionProps}
            open={codeOpen}
            onToggle={() => setCodeOpen((v) => !v)}
          />
          <MessageSettingsInputSection
            {...sectionProps}
            open={inputOpen}
            onToggle={() => setInputOpen((v) => !v)}
          />
        </div>

        <footer className="tm-message-settings-footer">
          <button type="button" className="tm-message-settings-reset" onClick={onReset}>
            {t('chat.restoreDefaults')}
          </button>
        </footer>
      </aside>
    </div>
  )
}
