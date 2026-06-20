import { useState } from 'react'
import { IconEdit, IconPlus, IconTrash } from '../../components/icons'
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

  const title = phrase ? '编辑快捷短语' : '添加快捷短语'

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
          <button type="button" className="tm-channel-config-close" aria-label="关闭" onClick={onClose}>
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
            <label className="tm-channel-config-label">名称</label>
            <SettingsInput value={label} placeholder="显示在菜单中的名称" onChange={setLabel} />
          </div>

          <div className="tm-channel-config-field">
            <label className="tm-channel-config-label">
              内容<span className="tm-channel-config-required">*</span>
            </label>
            <textarea
              className="tm-channel-config-textarea"
              rows={5}
              value={text}
              placeholder="插入到输入框中的短语内容"
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <p className="tm-channel-config-field-hint">
            名称留空时将自动使用内容前缀；可在聊天输入框的快捷短语菜单中直接插入。
          </p>
        </div>

        <footer className="tm-channel-config-footer">
          <div className="tm-channel-config-footer-actions">
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--secondary"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="tm-channel-config-footer-btn tm-channel-config-footer-btn--primary"
              disabled={!text.trim()}
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function QuickPhrasesSettingsPanel() {
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
    if (!window.confirm(`确定删除快捷短语「${phrase.label}」？`)) return
    setPhrases(removeQuickPhrase(phrase.id))
  }

  return (
    <>
      <SettingsPageLayout>
        <SettingsSection
          title="快捷短语"
          intro="在输入框中快速插入常用提示词。"
          action={
            <button
              type="button"
              className="tm-mcp-add-btn"
              onClick={() => setEditingPhrase('new')}
            >
              <IconPlus size={14} />
              添加
            </button>
          }
        >
          {phrases.length === 0 ? (
            <p className="tm-quick-phrase-empty">暂无快捷短语，点击右上角「添加」创建。</p>
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
                    title="编辑"
                    onClick={() => setEditingPhrase(phrase)}
                  >
                    <IconEdit size={14} />
                  </button>
                  <button
                    type="button"
                    className="tm-provider-icon-btn tm-provider-icon-btn--danger"
                    title="删除"
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
