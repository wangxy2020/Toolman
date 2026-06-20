import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type MemoryEntry } from '@toolman/shared'

interface Props {
  workspaceId: string
  onCountChange?: (count: number) => void
}

function formatMemorySource(source: MemoryEntry['source']): string {
  switch (source) {
    case 'conversation':
      return '从对话中记忆'
    case 'manual':
      return '手动添加'
    case 'import':
      return '导入'
    default:
      return source
  }
}

function MemoryDeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

export function MemoryEntryPanel({ workspaceId, onCountChange }: Props) {
  const [items, setItems] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

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
      onCountChange?.(0)
      return
    }
    const data = result.data as { items: MemoryEntry[] }
    setItems(data.items)
    onCountChange?.(data.items.length)
  }, [onCountChange, workspaceId])

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

  const handleClearAll = async () => {
    if (items.length === 0) return
    if (!window.confirm('确定清空全部长期记忆吗？此操作不可撤销。')) return

    setClearing(true)
    setError(null)
    for (const item of items) {
      const result = await window.api.invoke(IpcChannel.MemoryEntryDelete, {
        workspaceId,
        entryId: item.id,
      })
      if (!result.ok) {
        setError(result.error.message)
        setClearing(false)
        await load()
        return
      }
    }
    setClearing(false)
    await load()
  }

  return (
    <div className="tm-kb-memory-panel">
      <div className="tm-kb-memory-panel-head">
        <span className="tm-kb-memory-panel-title">自动保存的上下文记忆</span>
        <button
          type="button"
          className="tm-kb-memory-panel-clear"
          disabled={loading || clearing || items.length === 0}
          onClick={() => void handleClearAll()}
        >
          清空全部
        </button>
      </div>

      <p className="tm-kb-memory-panel-hint">
        对话中由智能体保存的跨会话记忆，删除后不会影响已索引的知识库文档。
      </p>

      {loading ? <p className="tm-kb-memory-panel-empty">加载中…</p> : null}
      {error ? <p className="tm-form-error">{error}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="tm-kb-memory-panel-empty">暂无长期记忆</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="tm-kb-memory-entry-list">
          {items.map((item) => (
            <li key={item.id} className="tm-kb-memory-entry-card">
              <div className="tm-kb-memory-entry-body">
                <p className="tm-kb-memory-entry-content">{item.content}</p>
                <span className="tm-kb-memory-entry-meta">
                  {new Date(item.createdAt).toLocaleString()} · {formatMemorySource(item.source)}
                </span>
              </div>
              <button
                type="button"
                className="tm-kb-memory-entry-delete"
                aria-label="删除记忆"
                disabled={clearing}
                onClick={() => void handleDelete(item.id)}
              >
                <MemoryDeleteIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
