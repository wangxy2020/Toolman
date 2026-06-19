import { useState } from 'react'
import { IpcChannel } from '@toolman/shared'

interface Props {
  workspaceId: string
  onChanged?: () => void
}

export function KnowledgeSourcesPanel({ workspaceId, onChanged }: Props) {
  const [rebuildingFts, setRebuildingFts] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ftsMessage, setFtsMessage] = useState<string | null>(null)

  const handleFtsRebuild = async () => {
    if (!window.confirm('确定重建工作区全文检索（FTS）索引吗？大型知识库可能需要一些时间。')) {
      return
    }

    setRebuildingFts(true)
    setError(null)
    setFtsMessage(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeFtsRebuild, { workspaceId })
    setRebuildingFts(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { indexed: number }
    setFtsMessage(`全文检索索引已重建，共索引 ${data.indexed} 个文本块。`)
    onChanged?.()
  }

  return (
    <section className="tm-knowledge-settings-section">
      <h3 className="tm-knowledge-settings-heading">索引维护</h3>
      <p className="tm-knowledge-detail-hint">
        当检索结果异常或 FTS 数据损坏时，可重建工作区全文检索索引（不影响向量索引）。
      </p>
      <button
        type="button"
        className="tm-btn tm-btn--secondary"
        disabled={rebuildingFts}
        onClick={() => void handleFtsRebuild()}
      >
        {rebuildingFts ? '重建中…' : '重建 FTS 索引'}
      </button>
      {error ? <p className="tm-form-error">{error}</p> : null}
      {ftsMessage ? <p className="tm-knowledge-detail-hint">{ftsMessage}</p> : null}
    </section>
  )
}
