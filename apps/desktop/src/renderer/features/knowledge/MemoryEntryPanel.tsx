import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type MemoryEntry } from '@toolman/shared'

interface Props {
  workspaceId: string
}

export function MemoryEntryPanel({ workspaceId }: Props) {
  const [items, setItems] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.MemoryEntryList, {
      workspaceId,
      limit: 100,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: MemoryEntry[] }
    setItems(data.items)
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async (entryId: string) => {
    if (!window.confirm('确定删除这条长期记忆吗？')) return
    const result = await window.api.invoke(IpcChannel.MemoryEntryDelete, {
      workspaceId,
      entryId,
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    await load()
  }

  return (
    <section className="tm-knowledge-settings-section">
      <h3 className="tm-knowledge-settings-heading">长期记忆</h3>
      <p className="tm-knowledge-detail-hint">
        对话中由智能体保存的跨会话记忆，删除后不会影响已索引的知识库文档。
      </p>
      {loading ? <p className="tm-knowledge-detail-hint">加载中…</p> : null}
      {error ? <p className="tm-form-error">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="tm-knowledge-detail-hint">暂无长期记忆</p>
      ) : null}
      {items.length > 0 ? (
        <ul className="tm-memory-entry-list">
          {items.map((item) => (
            <li key={item.id} className="tm-memory-entry-item">
              <div className="tm-memory-entry-content">{item.content}</div>
              <div className="tm-memory-entry-meta">
                {new Date(item.createdAt).toLocaleString()} · {item.source}
              </div>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-memory-entry-delete"
                onClick={() => void handleDelete(item.id)}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
