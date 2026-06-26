import { useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type KnowledgeBase, type KnowledgeSearchResult, type Session } from '@toolman/shared'
import { IconSearch } from '../icons'
import { useI18n } from '../../i18n/useI18n'
import { translateSessionTitle } from '../../i18n/system-labels'
import { searchNotes, type NotesSearchResult } from '../../features/notes/notes-search'
import type { NoteItem } from '../../features/notes/notes-storage'

interface Props {
  workspaceId: string | null
  sessions: Session[]
  notes: NoteItem[]
  knowledgeBases: KnowledgeBase[]
  onSelectSession: (id: string) => void
  onSelectNote: (id: string) => void
  onSelectKnowledgeBase: (id: string) => void
  onClose: () => void
}

export function GlobalSearchPanel({
  workspaceId,
  sessions,
  notes,
  knowledgeBases,
  onSelectSession,
  onSelectNote,
  onSelectKnowledgeBase,
  onClose,
}: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [kbLoading, setKbLoading] = useState(false)
  const [kbError, setKbError] = useState<string | null>(null)
  const [kbResults, setKbResults] = useState<KnowledgeSearchResult[]>([])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const trimmed = query.trim()
  const lowered = trimmed.toLowerCase()

  const sessionResults = useMemo(() => {
    if (!lowered) return sessions.slice(0, 8)
    return sessions
      .filter((session) => {
        const displayTitle = translateSessionTitle(session.title, t)
        return (
          session.title.toLowerCase().includes(lowered) ||
          displayTitle.toLowerCase().includes(lowered)
        )
      })
      .slice(0, 12)
  }, [lowered, sessions, t])

  const noteResults = useMemo<NotesSearchResult[]>(() => {
    if (!trimmed) return []
    return searchNotes(notes, trimmed).slice(0, 12)
  }, [notes, trimmed])

  const kbNameResults = useMemo(() => {
    if (!lowered) return knowledgeBases.slice(0, 6)
    return knowledgeBases
      .filter(
        (item) =>
          item.name.toLowerCase().includes(lowered) ||
          (item.description ?? '').toLowerCase().includes(lowered),
      )
      .slice(0, 8)
  }, [knowledgeBases, lowered])

  useEffect(() => {
    if (!workspaceId || trimmed.length < 2) {
      setKbResults([])
      setKbError(null)
      setKbLoading(false)
      return
    }

    const kbIds = knowledgeBases.map((item) => item.id)
    if (kbIds.length === 0) return

    let cancelled = false
    setKbLoading(true)
    setKbError(null)

    void (async () => {
      const result = await window.api.invoke(IpcChannel.KnowledgeSearch, {
        workspaceId,
        kbIds,
        query: trimmed,
        topK: 8,
        hybridEnabled: true,
      })
      if (cancelled) return
      setKbLoading(false)
      if (!result.ok) {
        setKbError(result.error.message)
        setKbResults([])
        return
      }
      const data = result.data as { items: KnowledgeSearchResult[] }
      setKbResults(data.items)
    })()

    return () => {
      cancelled = true
    }
  }, [knowledgeBases, trimmed, workspaceId])

  const hasAnyResults =
    sessionResults.length > 0 ||
    noteResults.length > 0 ||
    kbNameResults.length > 0 ||
    kbResults.length > 0 ||
    kbLoading

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-search-panel tm-search-panel--global" onClick={(e) => e.stopPropagation()}>
        <div className="tm-search-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            type="search"
            className="tm-search-input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="tm-search-results">
          {!trimmed ? (
            <div className="tm-empty tm-empty--compact">{t('search.emptyHint')}</div>
          ) : null}

          {sessionResults.length > 0 ? (
            <>
              <div className="tm-search-result-group-label">{t('search.sessions')}</div>
              {sessionResults.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="tm-search-result"
                  onClick={() => {
                    onSelectSession(session.id)
                    onClose()
                  }}
                >
                  <span className="tm-search-result-title">
                    {translateSessionTitle(session.title, t)}
                  </span>
                  <span className="tm-search-result-meta">
                    {t('search.messageCount', { count: session.messageCount })}
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {noteResults.length > 0 ? (
            <>
              <div className="tm-search-result-group-label">{t('search.notes')}</div>
              {noteResults.map(({ note }) => (
                <button
                  key={note.id}
                  type="button"
                  className="tm-search-result"
                  onClick={() => {
                    onSelectNote(note.id)
                    onClose()
                  }}
                >
                  <span className="tm-search-result-title">{note.title}</span>
                  <span className="tm-search-result-meta">
                    {(note.tags ?? []).length > 0 ? `#${(note.tags ?? []).join(' #')}` : t('search.noTags')}
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {kbNameResults.length > 0 ? (
            <>
              <div className="tm-search-result-group-label">{t('search.knowledge')}</div>
              {kbNameResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="tm-search-result"
                  onClick={() => {
                    onSelectKnowledgeBase(item.id)
                    onClose()
                  }}
                >
                  <span className="tm-search-result-title">{item.name}</span>
                  <span className="tm-search-result-meta">
                    {t('search.documentCount', { count: item.documentCount })}
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {trimmed.length >= 2 ? (
            kbLoading ? (
              <div className="tm-empty tm-empty--compact">{t('search.kbLoading')}</div>
            ) : kbError ? (
              <div className="tm-empty tm-empty--compact">{kbError}</div>
            ) : kbResults.length > 0 ? (
              <>
                <div className="tm-search-result-group-label">{t('search.knowledgeDocs')}</div>
                {kbResults.map((item) => (
                  <button
                    key={item.chunkId}
                    type="button"
                    className="tm-search-result tm-search-result--chunk"
                    onClick={() => {
                      onSelectKnowledgeBase(item.kbId)
                      onClose()
                    }}
                  >
                    <span className="tm-search-result-title">{item.documentTitle}</span>
                    <span className="tm-search-result-meta">
                      {(item.score * 100).toFixed(0)}% · {item.kbName}
                    </span>
                    <span className="tm-search-result-snippet">{item.text}</span>
                  </button>
                ))}
              </>
            ) : null
          ) : null}

          {trimmed && !hasAnyResults ? (
            <div className="tm-empty">{t('search.noResults')}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
