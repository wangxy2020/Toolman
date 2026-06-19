import { useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, type KnowledgeBase, type KnowledgeSearchResult } from '@toolman/shared'
import { IconSearch } from '../icons'

interface Props {
  workspaceId: string | null
  items: KnowledgeBase[]
  activeId: string | null
  onSelectKb: (id: string) => void
  onClose: () => void
}

export function KnowledgeSearchPanel({
  workspaceId,
  items,
  activeId,
  onSelectKb,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [chunkResults, setChunkResults] = useState<KnowledgeSearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)

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

  const kbMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 20)
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20)
  }, [items, query])

  useEffect(() => {
    const trimmed = query.trim()
    if (!workspaceId || trimmed.length < 2) {
      setChunkResults([])
      setSearchError(null)
      setLoading(false)
      return
    }

    const kbIds = items.map((item) => item.id)
    if (kbIds.length === 0) return

    let cancelled = false
    setLoading(true)
    setSearchError(null)

    void (async () => {
      const result = await window.api.invoke(IpcChannel.KnowledgeSearch, {
        workspaceId,
        kbIds,
        query: trimmed,
        topK: 12,
        hybridEnabled: true,
      })
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        setSearchError(result.error.message)
        setChunkResults([])
        return
      }
      const data = result.data as { items: KnowledgeSearchResult[] }
      setChunkResults(data.items)
    })()

    return () => {
      cancelled = true
    }
  }, [items, query, workspaceId])

  const showChunkResults = query.trim().length >= 2

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-search-panel tm-search-panel--knowledge" onClick={(e) => e.stopPropagation()}>
        <div className="tm-search-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            type="search"
            className="tm-search-input"
            placeholder="搜索知识库名称或文档内容…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="tm-search-results">
          {searchError ? <div className="tm-empty tm-empty--compact">{searchError}</div> : null}

          {kbMatches.length > 0 ? (
            <>
              <div className="tm-search-result-group-label">知识库</div>
              {kbMatches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    'tm-search-result',
                    activeId === item.id ? 'tm-search-result--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    onSelectKb(item.id)
                    onClose()
                  }}
                >
                  <span className="tm-search-result-title">{item.name}</span>
                  <span className="tm-search-result-meta">
                    {item.documentCount} 个文档
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {showChunkResults ? (
            loading ? (
              <div className="tm-empty tm-empty--compact">正在检索文档…</div>
            ) : chunkResults.length === 0 && !searchError ? (
              <div className="tm-empty tm-empty--compact">未找到相关文档片段</div>
            ) : (
              <>
                <div className="tm-search-result-group-label">文档片段</div>
                {chunkResults.map((item) => (
                  <button
                    key={item.chunkId}
                    type="button"
                    className="tm-search-result tm-search-result--chunk"
                    onClick={() => {
                      onSelectKb(item.kbId)
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
            )
          ) : null}

          {!loading && kbMatches.length === 0 && !showChunkResults ? (
            <div className="tm-empty">未找到匹配知识库</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
