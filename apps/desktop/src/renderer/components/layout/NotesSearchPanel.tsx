import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSearch } from '../icons'
import { collectAllTags, searchNotes, type NotesSearchResult } from '../../features/notes/notes-search'
import type { NoteItem } from '../../features/notes/notes-storage'

interface Props {
  notes: NoteItem[]
  activeNoteId: string | null
  searchQuery: string
  activeTagFilter: string | null
  onSearchQueryChange: (query: string) => void
  onTagFilterChange: (tag: string | null) => void
  onSelectNote: (noteId: string) => void
  onClose: () => void
}

export function NotesSearchPanel({
  notes,
  activeNoteId,
  searchQuery,
  activeTagFilter,
  onSearchQueryChange,
  onTagFilterChange,
  onSelectNote,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draftQuery, setDraftQuery] = useState(searchQuery)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setDraftQuery(searchQuery)
  }, [searchQuery])

  const tags = useMemo(() => collectAllTags(notes), [notes])

  const results = useMemo<NotesSearchResult[]>(() => {
    return searchNotes(notes, draftQuery, { tag: activeTagFilter })
  }, [activeTagFilter, draftQuery, notes])

  const handleQueryChange = (value: string) => {
    setDraftQuery(value)
    onSearchQueryChange(value)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-search-panel tm-search-panel--notes" onClick={(e) => e.stopPropagation()}>
        <div className="tm-search-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            type="search"
            className="tm-search-input"
            placeholder="搜索笔记标题、正文或标签…"
            value={draftQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
            }}
          />
        </div>

        {tags.length > 0 ? (
          <div className="tm-notes-sidebar-tags tm-notes-sidebar-tags--panel">
            <button
              type="button"
              className={[
                'tm-notes-sidebar-tag-btn',
                activeTagFilter === null ? 'tm-notes-sidebar-tag-btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onTagFilterChange(null)}
            >
              全部
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={[
                  'tm-notes-sidebar-tag-btn',
                  activeTagFilter === tag ? 'tm-notes-sidebar-tag-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onTagFilterChange(activeTagFilter === tag ? null : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : null}

        <div className="tm-search-results">
          {results.length === 0 ? (
            <div className="tm-empty tm-empty--compact">没有匹配的笔记</div>
          ) : (
            results.map(({ note }) => (
              <button
                key={note.id}
                type="button"
                className={[
                  'tm-search-result',
                  activeNoteId === note.id ? 'tm-search-result--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  onSelectNote(note.id)
                  onClose()
                }}
              >
                <span className="tm-search-result-title">{note.title}</span>
                <span className="tm-search-result-meta">
                  {(note.tags ?? []).length > 0 ? `#${(note.tags ?? []).join(' #')}` : '无标签'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
