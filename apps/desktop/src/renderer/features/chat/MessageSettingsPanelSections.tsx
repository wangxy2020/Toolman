import type { CSSProperties } from 'react'

import {
  CODE_STYLE_OPTIONS,
  MESSAGE_STYLE_OPTIONS,
  MATH_ENGINE_OPTIONS,
  SEND_SHORTCUT_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  messageFontSizePx,
  type MessageSettings,
} from './message-settings'
import {
  CollapsibleSection,
  SettingLabel,
  SettingSelect,
  Toggle,
} from './message-settings-panel-components'
import { useI18n } from '../../i18n/useI18n'

interface SectionProps {
  settings: MessageSettings
  onChange: (patch: Partial<MessageSettings>) => void
  open: boolean
  onToggle: () => void
}

export function MessageSettingsMessagesSection({
  settings,
  onChange,
  open,
  onToggle,
}: SectionProps) {
  const { t } = useI18n()
  const fontSizePx = messageFontSizePx(settings.messageFontSize)
  const sliderStyle = {
    '--slider-progress': `${settings.messageFontSize}%`,
  } as CSSProperties
  const messageStyleOptions = MESSAGE_STYLE_OPTIONS.map((opt) => ({
    ...opt,
    label: t(`chat.messageStyles.${opt.value}`),
  }))

  return (
    <CollapsibleSection title={t('chat.sections.messages')} open={open} onToggle={onToggle}>
      <div className="tm-msg-setting-row">
        <SettingLabel>{t('chat.fields.serifFont')}</SettingLabel>
        <Toggle checked={settings.useSerifFont} onChange={(useSerifFont) => onChange({ useSerifFont })} />
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
  )
}

export function MessageSettingsMathSection({
  settings,
  onChange,
  open,
  onToggle,
}: SectionProps) {
  const { t } = useI18n()

  return (
    <CollapsibleSection title={t('chat.sections.math')} open={open} onToggle={onToggle}>
      <div className="tm-msg-setting-row">
        <SettingLabel>{t('chat.fields.mathEngine')}</SettingLabel>
        <SettingSelect
          value={settings.mathEngine}
          options={MATH_ENGINE_OPTIONS}
          onChange={(mathEngine) => onChange({ mathEngine })}
        />
      </div>
      <div className="tm-msg-setting-row">
        <SettingLabel help={t('chat.fields.inlineMath')}>{t('chat.fields.inlineMath')}</SettingLabel>
        <Toggle
          checked={settings.enableInlineDollar}
          onChange={(enableInlineDollar) => onChange({ enableInlineDollar })}
        />
      </div>
    </CollapsibleSection>
  )
}

export function MessageSettingsCodeSection({
  settings,
  onChange,
  open,
  onToggle,
}: SectionProps) {
  const { t } = useI18n()

  return (
    <CollapsibleSection title={t('chat.sections.codeBlocks')} open={open} onToggle={onToggle}>
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
        <Toggle checked={settings.codeEditor} onChange={(codeEditor) => onChange({ codeEditor })} />
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
  )
}

export function MessageSettingsInputSection({
  settings,
  onChange,
  open,
  onToggle,
}: SectionProps) {
  const { t } = useI18n()
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
    <CollapsibleSection title={t('chat.sections.input')} open={open} onToggle={onToggle}>
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
  )
}
