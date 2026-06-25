import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { IconChevronRight, IconSliders } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  CODE_STYLE_OPTIONS,
  MESSAGE_STYLE_OPTIONS,
  MATH_ENGINE_OPTIONS,
  SEND_SHORTCUT_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  messageFontSizePx,
  type MessageSettings,
} from './message-settings'

interface Props {
  settings: MessageSettings
  onChange: (patch: Partial<MessageSettings>) => void
  onReset: () => void
  onClose: () => void
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

function SettingSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <select
      className="tm-msg-select"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function SettingLabel({
  children,
  help,
}: {
  children: ReactNode
  help?: string
}) {
  return (
    <span className="tm-msg-setting-label">
      {children}
      {help ? (
        <span className="tm-msg-help" title={help} aria-label={help}>
          ⓘ
        </span>
      ) : null}
    </span>
  )
}

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <section className="tm-msg-settings-section">
      <button type="button" className="tm-msg-settings-section-head" onClick={onToggle}>
        <span>{title}</span>
        <IconChevronRight open={open} size={12} />
      </button>
      {open && children ? <div className="tm-msg-settings-section-body">{children}</div> : null}
    </section>
  )
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

  const fontSizePx = messageFontSizePx(settings.messageFontSize)
  const sliderStyle = {
    '--slider-progress': `${settings.messageFontSize}%`,
  } as CSSProperties
  const messageStyleOptions = MESSAGE_STYLE_OPTIONS.map((opt) => ({
    ...opt,
    label: t(`chat.messageStyles.${opt.value}`),
  }))
  const targetLanguageOptions = TARGET_LANGUAGE_OPTIONS.map((opt) => ({
    ...opt,
    label: t(`agent.languages.${opt.value}`),
  }))
  const sendShortcutOptions = SEND_SHORTCUT_OPTIONS.map((opt) => {
    const key =
      opt.value === 'ctrl+enter'
        ? 'chat.input.sendCtrlEnter'
        : opt.value === 'shift+enter'
          ? 'chat.input.sendShiftEnter'
          : 'chat.input.sendEnter'
    return { ...opt, label: t(key) }
  })

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
          <CollapsibleSection
            title={t('chat.sections.messages')}
            open={messageOpen}
            onToggle={() => setMessageOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.serifFont')}</SettingLabel>
              <Toggle
                checked={settings.useSerifFont}
                onChange={(useSerifFont) => onChange({ useSerifFont })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel help={t('chat.fields.collapseThinkingHint')}>
                {t('chat.fields.collapseThinking')}
              </SettingLabel>
              <Toggle
                checked={settings.autoCollapseThinking}
                onChange={(autoCollapseThinking) => onChange({ autoCollapseThinking })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.messageStyle')}</SettingLabel>
              <SettingSelect
                value={settings.messageStyle}
                options={messageStyleOptions}
                onChange={(messageStyle) => onChange({ messageStyle })}
              />
            </div>

            <div className="tm-msg-setting-block tm-msg-font-block">
              <div className="tm-msg-font-block-head">
                <span>{t('chat.fields.messageFontSize')}</span>
                <span className="tm-msg-font-block-value">{fontSizePx}px</span>
              </div>
              <div className="tm-msg-font-slider-row">
                <span className="tm-msg-font-scale-sm">A⁻</span>
                <input
                  type="range"
                  className="tm-msg-font-slider"
                  style={sliderStyle}
                  min={0}
                  max={100}
                  value={settings.messageFontSize}
                  onChange={(e) => onChange({ messageFontSize: Number(e.target.value) })}
                />
                <span className="tm-msg-font-scale-lg">A⁺</span>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('chat.sections.math')}
            open={mathOpen}
            onToggle={() => setMathOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.mathEngine')}</SettingLabel>
              <SettingSelect
                value={settings.mathEngine}
                options={MATH_ENGINE_OPTIONS}
                onChange={(mathEngine) => onChange({ mathEngine })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel help={t('chat.fields.inlineMath')}>
                {t('chat.fields.inlineMath')}
              </SettingLabel>
              <Toggle
                checked={settings.enableInlineDollar}
                onChange={(enableInlineDollar) => onChange({ enableInlineDollar })}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('chat.sections.codeBlocks')}
            open={codeOpen}
            onToggle={() => setCodeOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.codeHighlight')}</SettingLabel>
              <SettingSelect
                value={settings.codeStyle}
                options={CODE_STYLE_OPTIONS}
                onChange={(codeStyle) => onChange({ codeStyle })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel help={t('chat.fields.fancyCodeTheme')}>
                {t('chat.fields.fancyCodeTheme')}
              </SettingLabel>
              <Toggle
                checked={settings.fancyCodeBlocks}
                onChange={(fancyCodeBlocks) => onChange({ fancyCodeBlocks })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.codeEditor')}</SettingLabel>
              <Toggle
                checked={settings.codeEditor}
                onChange={(codeEditor) => onChange({ codeEditor })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.showLineNumbers')}</SettingLabel>
              <Toggle
                checked={settings.showLineNumbers}
                onChange={(showLineNumbers) => onChange({ showLineNumbers })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.foldCodeBlocks')}</SettingLabel>
              <Toggle
                checked={settings.collapsibleCodeBlocks}
                onChange={(collapsibleCodeBlocks) => onChange({ collapsibleCodeBlocks })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.wrapLongLines')}</SettingLabel>
              <Toggle
                checked={settings.wrapCodeBlocks}
                onChange={(wrapCodeBlocks) => onChange({ wrapCodeBlocks })}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('chat.sections.input')}
            open={inputOpen}
            onToggle={() => setInputOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.pasteLongTextAsFile')}</SettingLabel>
              <Toggle
                checked={settings.pasteLongTextAsFile}
                onChange={(pasteLongTextAsFile) => onChange({ pasteLongTextAsFile })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.markdownInput')}</SettingLabel>
              <Toggle
                checked={settings.markdownRenderInput}
                onChange={(markdownRenderInput) => onChange({ markdownRenderInput })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.tripleSpaceTranslate')}</SettingLabel>
              <Toggle
                checked={settings.quickTranslateWithSpaces}
                onChange={(quickTranslateWithSpaces) => onChange({ quickTranslateWithSpaces })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.translateConfirm')}</SettingLabel>
              <Toggle
                checked={settings.showTranslateConfirmDialog}
                onChange={(showTranslateConfirmDialog) => onChange({ showTranslateConfirmDialog })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.smartMenu')}</SettingLabel>
              <Toggle
                checked={settings.enableSlashAtShortcutMenu}
                onChange={(enableSlashAtShortcutMenu) => onChange({ enableSlashAtShortcutMenu })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.confirmDeleteMessage')}</SettingLabel>
              <Toggle
                checked={settings.confirmBeforeDeleteMessage}
                onChange={(confirmBeforeDeleteMessage) => onChange({ confirmBeforeDeleteMessage })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.confirmRegenerate')}</SettingLabel>
              <Toggle
                checked={settings.confirmBeforeRegenerateMessage}
                onChange={(confirmBeforeRegenerateMessage) =>
                  onChange({ confirmBeforeRegenerateMessage })
                }
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.translateTarget')}</SettingLabel>
              <SettingSelect
                value={settings.targetLanguage}
                options={targetLanguageOptions}
                onChange={(targetLanguage) => onChange({ targetLanguage })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>{t('chat.fields.sendShortcut')}</SettingLabel>
              <SettingSelect
                value={settings.sendShortcut}
                options={sendShortcutOptions}
                onChange={(sendShortcut) => onChange({ sendShortcut })}
              />
            </div>
          </CollapsibleSection>
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
