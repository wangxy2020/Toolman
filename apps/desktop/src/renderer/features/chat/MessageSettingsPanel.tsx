import { useEffect, useState } from 'react'
import { IconChevronRight } from '../../components/icons'
import {
  CODE_STYLE_OPTIONS,
  MESSAGE_STYLE_OPTIONS,
  SEND_SHORTCUT_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  type MessageSettings,
} from './message-settings'

interface Props {
  settings: MessageSettings
  onChange: (patch: Partial<MessageSettings>) => void
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
    <div className="tm-msg-select-wrap">
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
    </div>
  )
}

function SettingLabel({
  children,
  help,
}: {
  children: React.ReactNode
  help?: string
}) {
  return (
    <span className="tm-msg-setting-label">
      {children}
      {help ? (
        <button type="button" className="tm-msg-help" title={help}>
          ?
        </button>
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
  children?: React.ReactNode
}) {
  return (
    <section className="tm-msg-settings-section">
      <button type="button" className="tm-msg-settings-section-head" onClick={onToggle}>
        <IconChevronRight open={open} size={14} />
        <span>{title}</span>
      </button>
      {open && children ? <div className="tm-msg-settings-section-body">{children}</div> : null}
    </section>
  )
}

export function MessageSettingsPanel({ settings, onChange, onClose }: Props) {
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

  return (
    <div className="tm-message-settings-overlay" onClick={onClose}>
      <aside className="tm-message-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tm-message-settings-scroll">
          <CollapsibleSection
            title="消息设置"
            open={messageOpen}
            onToggle={() => setMessageOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>使用衬线字体</SettingLabel>
              <Toggle
                checked={settings.useSerifFont}
                onChange={(useSerifFont) => onChange({ useSerifFont })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel help="开启后，思考过程默认折叠显示">思考内容自动折叠</SettingLabel>
              <Toggle
                checked={settings.autoCollapseThinking}
                onChange={(autoCollapseThinking) => onChange({ autoCollapseThinking })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>消息样式</SettingLabel>
              <SettingSelect
                value={settings.messageStyle}
                options={MESSAGE_STYLE_OPTIONS}
                onChange={(messageStyle) => onChange({ messageStyle })}
              />
            </div>

            <div className="tm-msg-setting-block">
              <SettingLabel>消息字体大小</SettingLabel>
              <input
                type="range"
                className="tm-msg-font-slider"
                min={0}
                max={100}
                value={settings.messageFontSize}
                onChange={(e) => onChange({ messageFontSize: Number(e.target.value) })}
              />
              <div className="tm-msg-font-scale">
                <span className="tm-msg-font-scale-sm">A</span>
                <span className="tm-msg-font-scale-mid">默认</span>
                <span className="tm-msg-font-scale-lg">A</span>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="数学公式设置"
            open={mathOpen}
            onToggle={() => setMathOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel help="当前仅支持 KaTeX 渲染">数学公式引擎</SettingLabel>
              <SettingSelect
                value={settings.mathEngine === 'mathjax' ? 'katex' : settings.mathEngine}
                options={[{ value: 'katex' as const, label: 'KaTeX' }]}
                onChange={(mathEngine) => onChange({ mathEngine })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel help="允许使用 $...$ 语法渲染行内数学公式">启用 $...$</SettingLabel>
              <Toggle
                checked={settings.enableInlineDollar}
                onChange={(enableInlineDollar) => onChange({ enableInlineDollar })}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="代码块设置"
            open={codeOpen}
            onToggle={() => setCodeOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>代码风格</SettingLabel>
              <SettingSelect
                value={settings.codeStyle}
                options={CODE_STYLE_OPTIONS}
                onChange={(codeStyle) => onChange({ codeStyle })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel help="为代码块启用更丰富的展示样式">花式代码块</SettingLabel>
              <Toggle
                checked={settings.fancyCodeBlocks}
                onChange={(fancyCodeBlocks) => onChange({ fancyCodeBlocks })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>代码编辑器</SettingLabel>
              <Toggle
                checked={settings.codeEditor}
                onChange={(codeEditor) => onChange({ codeEditor })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>代码显示行号</SettingLabel>
              <Toggle
                checked={settings.showLineNumbers}
                onChange={(showLineNumbers) => onChange({ showLineNumbers })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>代码块可折叠</SettingLabel>
              <Toggle
                checked={settings.collapsibleCodeBlocks}
                onChange={(collapsibleCodeBlocks) => onChange({ collapsibleCodeBlocks })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>代码块可换行</SettingLabel>
              <Toggle
                checked={settings.wrapCodeBlocks}
                onChange={(wrapCodeBlocks) => onChange({ wrapCodeBlocks })}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="输入设置"
            open={inputOpen}
            onToggle={() => setInputOpen((v) => !v)}
          >
            <div className="tm-msg-setting-row">
              <SettingLabel>长文本粘贴为文件</SettingLabel>
              <Toggle
                checked={settings.pasteLongTextAsFile}
                onChange={(pasteLongTextAsFile) => onChange({ pasteLongTextAsFile })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>Markdown 渲染输入消息</SettingLabel>
              <Toggle
                checked={settings.markdownRenderInput}
                onChange={(markdownRenderInput) => onChange({ markdownRenderInput })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>3 个空格快速翻译</SettingLabel>
              <Toggle
                checked={settings.quickTranslateWithSpaces}
                onChange={(quickTranslateWithSpaces) => onChange({ quickTranslateWithSpaces })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>显示翻译确认对话框</SettingLabel>
              <Toggle
                checked={settings.showTranslateConfirmDialog}
                onChange={(showTranslateConfirmDialog) => onChange({ showTranslateConfirmDialog })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>启用 / 和 @ 触发快捷菜单</SettingLabel>
              <Toggle
                checked={settings.enableSlashAtShortcutMenu}
                onChange={(enableSlashAtShortcutMenu) => onChange({ enableSlashAtShortcutMenu })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>删除消息前确认</SettingLabel>
              <Toggle
                checked={settings.confirmBeforeDeleteMessage}
                onChange={(confirmBeforeDeleteMessage) => onChange({ confirmBeforeDeleteMessage })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>重新生成消息前确认</SettingLabel>
              <Toggle
                checked={settings.confirmBeforeRegenerateMessage}
                onChange={(confirmBeforeRegenerateMessage) =>
                  onChange({ confirmBeforeRegenerateMessage })
                }
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>目标语言</SettingLabel>
              <SettingSelect
                value={settings.targetLanguage}
                options={TARGET_LANGUAGE_OPTIONS}
                onChange={(targetLanguage) => onChange({ targetLanguage })}
              />
            </div>

            <div className="tm-msg-setting-row">
              <SettingLabel>发送快捷键</SettingLabel>
              <SettingSelect
                value={settings.sendShortcut}
                options={SEND_SHORTCUT_OPTIONS}
                onChange={(sendShortcut) => onChange({ sendShortcut })}
              />
            </div>
          </CollapsibleSection>
        </div>
      </aside>
    </div>
  )
}
