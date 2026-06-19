import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type KnowledgeFileRegistryItem } from '@toolman/shared'
import { IconExternalLink, IconFile } from '../../components/icons'

interface Props {
  workspaceId: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export function KnowledgeFileRegistryPanel({ workspaceId }: Props) {
  const [items, setItems] = useState<KnowledgeFileRegistryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeFileRegistryList, {
      workspaceId,
      limit: 500,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: KnowledgeFileRegistryItem[] }
    setItems(data.items)
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  const handleOpenPath = async (absolutePath: string) => {
    await window.api.invoke(IpcChannel.AppShellOpenPath, { path: absolutePath })
  }

  return (
    <div className="tm-registry-page">
      <div className="tm-registry-intro">
        <p className="tm-registry-intro-title">已索引文件的原始路径登记</p>
        <p className="tm-registry-intro-hint">
          记录已成功导入知识库的本地文件路径、大小与内容哈希，便于核对索引来源、定位原文件，并为查重与后续同步提供依据。删除知识库文档后，对应登记会在刷新时自动移除。
        </p>
      </div>

      <div className="tm-registry-toolbar">
        <span className="tm-registry-count">
          {loading ? '加载中…' : `共 ${items.length} 个已登记文件`}
        </span>
        <button type="button" className="tm-btn tm-btn--ghost" onClick={() => void load()} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error ? <div className="tm-registry-error">{error}</div> : null}

      {!loading && items.length === 0 ? (
        <div className="tm-registry-empty">
          <p className="tm-registry-empty-title">暂无已登记文件</p>
          <p className="tm-registry-empty-hint">
            向知识库导入或监听文件夹中的文件后，成功索引的条目会自动出现在这里。
          </p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="tm-registry-table-wrap">
          <table className="tm-registry-table">
            <colgroup>
              <col className="tm-registry-col-file" />
              <col className="tm-registry-col-kb" />
              <col className="tm-registry-col-size" />
              <col className="tm-registry-col-hash" />
              <col className="tm-registry-col-time" />
              <col className="tm-registry-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="tm-registry-col-file">文件</th>
                <th className="tm-registry-col-kb">知识库</th>
                <th className="tm-registry-col-size">大小</th>
                <th className="tm-registry-col-hash">哈希</th>
                <th className="tm-registry-col-time">更新时间</th>
                <th className="tm-registry-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const displayName = item.documentTitle ?? fileNameFromPath(item.absolutePath)
                return (
                  <tr key={item.id}>
                    <td className="tm-registry-col-file">
                      <div className="tm-registry-file-cell">
                        <IconFile size={16} className="tm-registry-file-icon" />
                        <div
                          className="tm-registry-file-name"
                          title={`${displayName}\n${item.absolutePath}`}
                        >
                          {displayName}
                        </div>
                      </div>
                    </td>
                    <td className="tm-registry-col-kb" title={item.kbName ?? undefined}>
                      {item.kbName ?? '—'}
                    </td>
                    <td className="tm-registry-col-size">{formatBytes(item.sizeBytes)}</td>
                    <td className="tm-registry-col-hash" title={item.contentHash}>
                      {item.contentHash}
                    </td>
                    <td
                      className="tm-registry-col-time"
                      title={new Date(item.updatedAt).toLocaleString()}
                    >
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                    <td className="tm-registry-col-actions">
                      <div className="tm-registry-actions-cell">
                        <button
                          type="button"
                          className="tm-registry-action-btn"
                          title="在 Finder 中打开"
                          onClick={() => void handleOpenPath(item.absolutePath)}
                        >
                          <IconExternalLink size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
