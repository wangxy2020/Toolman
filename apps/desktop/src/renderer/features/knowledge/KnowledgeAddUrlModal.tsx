import { useState } from 'react'
import { normalizeUrlInput } from './knowledge-url-utils'

type ImportMode = 'url' | 'sitemap'

interface Props {
  onClose: () => void
  onSubmitUrl: (url: string) => Promise<void>
  onSubmitSitemap: (sitemapUrl: string) => Promise<void>
}

export function KnowledgeAddUrlModal({ onClose, onSubmitUrl, onSubmitSitemap }: Props) {
  const [mode, setMode] = useState<ImportMode>('url')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const normalized = normalizeUrlInput(url)
    if (!normalized) {
      setError(mode === 'url' ? '请输入网页地址' : '请输入 Sitemap 地址')
      return
    }

    try {
      new URL(normalized)
    } catch {
      setError(mode === 'url' ? '请输入有效的网页地址' : '请输入有效的 Sitemap 地址')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'url') {
        await onSubmitUrl(normalized)
      } else {
        await onSubmitSitemap(normalized)
      }
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '添加失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--knowledge-create"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">添加网页来源</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-modal-body">
          <div className="tm-knowledge-url-import-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={[
                'tm-knowledge-url-import-tab',
                mode === 'url' ? 'tm-knowledge-url-import-tab--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setMode('url')
                setError(null)
              }}
            >
              单个网页
            </button>
            <button
              type="button"
              role="tab"
              className={[
                'tm-knowledge-url-import-tab',
                mode === 'sitemap' ? 'tm-knowledge-url-import-tab--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setMode('sitemap')
                setError(null)
              }}
            >
              Sitemap
            </button>
          </div>

          <p className="tm-knowledge-detail-hint">
            {mode === 'url'
              ? '输入网页 URL 后，将抓取页面内容并索引到当前网络知识库。'
              : '输入 Sitemap URL 后，将批量抓取其中列出的网页并建立索引（最多 500 条）。'}
          </p>
          <label className="tm-form-field">
            <input
              className="tm-form-input"
              type="url"
              placeholder={
                mode === 'url' ? 'https://example.com/docs' : 'https://example.com/sitemap.xml'
              }
              value={url}
              autoFocus
              disabled={submitting}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSubmit()
              }}
            />
          </label>
          {error ? <p className="tm-form-error">{error}</p> : null}
        </div>

        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={submitting || !url.trim()}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '添加中…' : mode === 'url' ? '添加' : '导入 Sitemap'}
          </button>
        </footer>
      </div>
    </div>
  )
}
