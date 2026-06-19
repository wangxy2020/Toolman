import { useState } from 'react'
import type { NoteItem } from './notes-storage'

interface Props {
  note: NoteItem
  onAddTag: (noteId: string, tag: string) => void
  onRemoveTag: (noteId: string, tag: string) => void
}

export function NotesTagsEditor({ note, onAddTag, onRemoveTag }: Props) {
  const [draft, setDraft] = useState('')

  const commitTag = () => {
    const trimmed = draft.trim().replace(/^#+/, '')
    if (!trimmed) return
    onAddTag(note.id, trimmed)
    setDraft('')
  }

  return (
    <div className="tm-notes-tags-editor">
      <div className="tm-notes-tags">
        {(note.tags ?? []).map((tag) => (
          <button
            key={tag}
            type="button"
            className="tm-notes-tag"
            title="点击移除标签"
            onClick={() => onRemoveTag(note.id, tag)}
          >
            <span className="tm-notes-tag-label">#{tag}</span>
            <span className="tm-notes-tag-remove" aria-hidden="true">
              ×
            </span>
          </button>
        ))}
        <label className="tm-notes-tag-add">
          <span className="tm-notes-tag-add-prefix" aria-hidden="true">
            #
          </span>
          <input
            className="tm-notes-tag-input"
            value={draft}
            placeholder="输入标签名，按 Enter 确认"
            aria-label="输入标签名，按 Enter 确认"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitTag()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft('')
              }
            }}
          />
        </label>
      </div>
    </div>
  )
}
