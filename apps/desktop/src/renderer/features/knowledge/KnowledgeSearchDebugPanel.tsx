import { useState } from 'react'
import { IpcChannel, type KnowledgeSearchResult } from '@toolman/shared'

interface Props {
  workspaceId: string
  kbId: string
}

export function KnowledgeSearchDebugPanel({ workspaceId, kbId }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeSearch, {
      workspaceId,
      kbIds: [kbId],
      query: trimmed,
      topK: 8,
      hybridEnabled: true,
    })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { items: KnowledgeSearchResult[] }
    setResults(data.items)
  }

  return (
    <section className="tm-knowledge-settings-section">
      <h3 className="tm-knowledge-settings-heading">检索调试</h3>
      <p className="tm-knowledge-detail-hint">测试当前知识库的混合检索效果，仅用于调试。</p>
      <div className="tm-form-picker-row">
        <input
          className="tm-form-input"
          value={query}
          placeholder="输入检索问题"
          disabled={loading}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleSearch()
          }}
        />
        <button
          type="button"
          className="tm-btn tm-btn--secondary"
          disabled={loading || !query.trim()}
          onClick={() => void handleSearch()}
        >
          {loading ? '检索中…' : '检索'}
        </button>
      </div>
      {error ? <p className="tm-form-error">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="tm-knowledge-search-debug-list">
          {results.map((item) => (
            <li key={item.chunkId} className="tm-knowledge-search-debug-item">
              <div className="tm-knowledge-search-debug-title">
                {item.documentTitle} · {(item.score * 100).toFixed(1)}%
              </div>
              <div className="tm-knowledge-search-debug-text">{item.text}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
