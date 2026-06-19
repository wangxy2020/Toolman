import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type KnowledgeIngestJob } from '@toolman/shared'

const STAGE_LABELS: Record<KnowledgeIngestJob['stage'], string> = {
  queued: '排队中',
  parsing: '解析中',
  chunking: '分块中',
  embedding: '向量化',
  indexing: '索引中',
  done: '完成',
  failed: '失败',
}

interface Props {
  workspaceId: string
  kbId: string
}

export function KnowledgeIngestJobPanel({ workspaceId, kbId }: Props) {
  const [items, setItems] = useState<KnowledgeIngestJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeIngestJobList, {
      workspaceId,
      kbId,
      includeFailed: true,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: KnowledgeIngestJob[] }
    setItems(data.items)
  }, [workspaceId, kbId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [load])

  const handleCancel = async (documentId: string) => {
    const result = await window.api.invoke(IpcChannel.KnowledgeIngestJobCancel, {
      workspaceId,
      kbId,
      documentId,
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    await load()
  }

  const handleRetry = async (documentId: string) => {
    const result = await window.api.invoke(IpcChannel.KnowledgeIngestJobRetry, {
      workspaceId,
      kbId,
      documentId,
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    await load()
  }

  if (!loading && items.length === 0) {
    return (
      <section className="tm-knowledge-settings-section">
        <h3 className="tm-knowledge-settings-heading">索引任务</h3>
        <p className="tm-knowledge-detail-hint">
          进行中的文档索引任务会显示在这里，可取消或重试失败项。当前没有排队、进行中或失败的任务。
        </p>
      </section>
    )
  }

  return (
    <section className="tm-knowledge-settings-section">
      <div className="tm-knowledge-ingest-job-header">
        <h3 className="tm-knowledge-settings-heading">索引任务</h3>
        <button type="button" className="tm-btn tm-btn--ghost" onClick={() => void load()} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>
      <p className="tm-knowledge-detail-hint">进行中的文档索引任务，可取消或重试失败项。</p>
      {error ? <p className="tm-form-error">{error}</p> : null}
      <ul className="tm-knowledge-ingest-job-list">
        {items.map((item) => {
          const isActive = !['done', 'failed'].includes(item.stage)
          return (
            <li key={item.id} className="tm-knowledge-ingest-job-item">
              <div className="tm-knowledge-ingest-job-main">
                <div className="tm-knowledge-ingest-job-title">{item.title}</div>
                {item.absolutePath ? (
                  <div className="tm-knowledge-ingest-job-path">{item.absolutePath}</div>
                ) : null}
                <div className="tm-knowledge-ingest-job-meta">
                  {STAGE_LABELS[item.stage]} · {item.progress}%
                  {item.errorMessage ? ` · ${item.errorMessage}` : ''}
                </div>
                <div className="tm-knowledge-ingest-job-progress">
                  <div
                    className="tm-knowledge-ingest-job-progress-bar"
                    style={{ width: `${Math.max(item.progress, 5)}%` }}
                  />
                </div>
              </div>
              <div className="tm-knowledge-ingest-job-actions">
                {isActive ? (
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost"
                    onClick={() => void handleCancel(item.documentId)}
                  >
                    取消
                  </button>
                ) : null}
                {item.stage === 'failed' ? (
                  <button
                    type="button"
                    className="tm-btn tm-btn--ghost"
                    onClick={() => void handleRetry(item.documentId)}
                  >
                    重试
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
