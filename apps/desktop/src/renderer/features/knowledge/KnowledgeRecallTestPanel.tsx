import { useState } from 'react'
import { IpcChannel, type KnowledgeSearchResult } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceId: string
  kbId: string
}

function formatHitMeta(item: KnowledgeSearchResult, t: (key: string, params?: Record<string, string | number>) => string) {
  const parts: string[] = []
  if (item.fileName || item.documentTitle) {
    parts.push(item.fileName || item.documentTitle)
  }
  if (item.pageNumber != null) {
    parts.push(t('knowledgePage.recallTest.page', { page: item.pageNumber }))
  }
  if (item.chunkIndex != null) {
    parts.push(t('knowledgePage.recallTest.chunk', { index: item.chunkIndex }))
  }
  if (item.heading?.trim()) {
    parts.push(item.heading.trim())
  }
  return parts.join(' · ')
}

export function KnowledgeRecallTestPanel({ workspaceId, kbId }: Props) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])

  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setSearched(true)
    const result = await window.api.invoke(IpcChannel.KnowledgeSearch, {
      workspaceId,
      kbIds: [kbId],
      query: trimmed,
      topK: 16,
      hybridEnabled: true,
    })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      setResults([])
      return
    }

    const data = result.data as { items: KnowledgeSearchResult[] }
    setResults(data.items)
  }

  return (
    <section className="tm-knowledge-settings-section">
      <h3 className="tm-knowledge-settings-heading">{t('knowledgePage.recallTest.title')}</h3>
      <p className="tm-knowledge-detail-hint">{t('knowledgePage.recallTest.hint')}</p>
      <div className="tm-form-picker-row">
        <input
          className="tm-form-input"
          value={query}
          placeholder={t('knowledgePage.recallTest.placeholder')}
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
          {loading ? t('knowledgePage.recallTest.searching') : t('knowledgePage.recallTest.search')}
        </button>
      </div>
      {error ? <p className="tm-form-error">{error}</p> : null}
      {searched && !loading && !error && results.length === 0 ? (
        <p className="tm-knowledge-detail-hint">{t('knowledgePage.recallTest.empty')}</p>
      ) : null}
      {results.length > 0 ? (
        <ul className="tm-knowledge-search-debug-list">
          {results.map((item, index) => (
            <li key={`${item.chunkId}-${index}`} className="tm-knowledge-search-debug-item">
              <div className="tm-knowledge-search-debug-title">
                <span>
                  {t('knowledgePage.recallTest.rank', { rank: index + 1 })} ·{' '}
                  {(item.score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="tm-knowledge-search-debug-meta">{formatHitMeta(item, t)}</div>
              {item.sourcePath ? (
                <div className="tm-knowledge-search-debug-meta tm-knowledge-search-debug-path">
                  {item.sourcePath}
                </div>
              ) : null}
              <div className="tm-knowledge-search-debug-text">{item.text}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
