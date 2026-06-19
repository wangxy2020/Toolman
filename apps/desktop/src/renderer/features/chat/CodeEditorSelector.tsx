import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '@toolman/shared'
import { IconChevronDown, IconCodeEditor } from '../../components/icons'
import {
  CODE_EDITOR_OPTIONS,
  getCodeEditorId,
  getCodeEditorLabel,
  type CodeEditorId,
} from './code-editor-options'

interface Props {
  workspace: Workspace | null
  onChange: (editorId: CodeEditorId) => void
}

export function CodeEditorSelector({ workspace, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const editorId = getCodeEditorId(workspace?.settings)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="tm-code-editor-selector" ref={wrapRef}>
      <button
        type="button"
        className="tm-chat-header-editor-btn"
        title={`编码程序：${getCodeEditorLabel(editorId)}`}
        onClick={() => setOpen((v) => !v)}
      >
        <IconCodeEditor editorId={editorId} size={16} />
        <IconChevronDown size={12} />
      </button>

      {open && (
        <div className="tm-code-editor-panel">
          {CODE_EDITOR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`tm-code-editor-option ${opt.id === editorId ? 'tm-code-editor-option--active' : ''}`}
              onClick={() => {
                onChange(opt.id)
                setOpen(false)
              }}
            >
              <IconCodeEditor editorId={opt.id} size={16} />
              <span>{opt.label}</span>
              {opt.id === editorId && <span className="tm-code-editor-option-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
