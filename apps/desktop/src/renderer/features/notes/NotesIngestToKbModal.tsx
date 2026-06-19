import { useEffect, useRef, useState } from 'react'
import { IpcChannel, type KnowledgeBase } from '@toolman/shared'

interface Props {
  workspaceId: string | null
  knowledgeBases: KnowledgeBase[]
  noteIds?: string[]
  notebookId?: string
  notebookName?: string
  noteTitle?: string
  onClose: () => void
  onDone?: (message: string) => void
}

export function NotesIngestToKbModal({
  workspaceId,
  knowledgeBases,
  noteIds,
  notebookId,
  notebookName,
  noteTitle,
  onClose,
  onDone,
}: Props) {
  const [kbId, setKbId] = useState(knowledgeBases[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    selectRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const targetLabel = noteTitle
    ? `笔记「${noteTitle}」`
    : notebookName
      ? `笔记本「${notebookName}」`
      : '所选内容'

  const handleSubmit = async () => {
    if (!workspaceId || !kbId) return
    setBusy(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.NotesIngestToKb, {
      workspaceId,
      kbId,
      noteIds,
      notebookId,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { queued: number; noteCount: number }
    onDone?.(`已将 ${data.noteCount} 篇笔记添加到知识库（${data.queued} 个文件待索引）`)
    onClose()
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--knowledge-create" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">添加到知识库</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="tm-modal-body">
          <p className="tm-form-hint">将 {targetLabel} 导出为 Markdown 并添加到所选知识库。</p>
          <label className="tm-form-field">
            <span className="tm-form-label">目标知识库</span>
            <select
              ref={selectRef}
              className="tm-form-input"
              value={kbId}
              onChange={(event) => setKbId(event.target.value)}
            >
              {knowledgeBases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="tm-form-error">{error}</p> : null}
        </div>
        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={busy || !workspaceId || !kbId || knowledgeBases.length === 0}
            onClick={() => void handleSubmit()}
          >
            {busy ? '添加中…' : '确认添加'}
          </button>
        </footer>
      </div>
    </div>
  )
}
