import { useState } from 'react'
import type { KnowledgeCitation } from '@toolman/shared'

interface Props {
  sources: KnowledgeCitation[]
}

export function KnowledgeSourcesBlock({ sources }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  return (
    <div className="tm-kb-sources-block">
      <button
        type="button"
        className="tm-kb-sources-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="tm-kb-sources-toggle-label">
          知识库引用 ({sources.length})
        </span>
        <span className="tm-kb-sources-toggle-icon">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded ? (
        <ol className="tm-kb-sources-list">
          {sources.map((source, index) => (
            <li key={`${source.documentTitle}-${index}`} className="tm-kb-sources-item">
              <div className="tm-kb-sources-item-head">
                <span className="tm-kb-sources-item-title">{source.documentTitle}</span>
                <span className="tm-kb-sources-item-meta">
                  {source.kbName} · {(source.score * 100).toFixed(1)}%
                </span>
              </div>
              {source.sourcePath ? (
                <div className="tm-kb-sources-item-path" title={source.sourcePath}>
                  {source.sourcePath}
                </div>
              ) : null}
              <div className="tm-kb-sources-item-text">{source.text.trim()}</div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
