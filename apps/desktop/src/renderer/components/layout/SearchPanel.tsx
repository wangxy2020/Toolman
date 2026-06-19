import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@toolman/shared'
import { IconSearch } from '../icons'

interface Props {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onClose: () => void
}

export function SearchPanel({ sessions, activeSessionId, onSelectSession, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions.slice(0, 20)
    return sessions.filter((s) => s.title.toLowerCase().includes(q)).slice(0, 30)
  }, [query, sessions])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tm-search-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            className="tm-search-input"
            placeholder="搜索话题…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="tm-search-results">
          {results.length === 0 ? (
            <div className="tm-empty">未找到匹配话题</div>
          ) : (
            results.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`tm-search-result ${activeSessionId === session.id ? 'tm-search-result--active' : ''}`}
                onClick={() => {
                  onSelectSession(session.id)
                  onClose()
                }}
              >
                <span className="tm-search-result-title">{session.title}</span>
                <span className="tm-search-result-meta">{session.messageCount} 条消息</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
