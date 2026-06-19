import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type ToolApprovalRequest } from '@toolman/shared'

export function ToolApprovalModal() {
  const [queue, setQueue] = useState<ToolApprovalRequest[]>([])
  const [responding, setResponding] = useState(false)
  const request = queue[0] ?? null

  useEffect(() => {
    return window.api.subscribe(IpcChannel.AgentToolApprovalRequest, (payload) => {
      const next = payload as ToolApprovalRequest
      setQueue((current) => {
        if (current.some((item) => item.requestId === next.requestId)) {
          return current
        }
        return [...current, next]
      })
    })
  }, [])

  const respond = useCallback(
    async (approved: boolean) => {
      if (!request || responding) return
      setResponding(true)
      await window.api.invoke(IpcChannel.AgentToolApprovalRespond, {
        requestId: request.requestId,
        approved,
      })
      setResponding(false)
      setQueue((current) => current.filter((item) => item.requestId !== request.requestId))
    },
    [request, responding],
  )

  if (!request) return null

  const preview =
    request.arguments.length > 1200
      ? `${request.arguments.slice(0, 1200)}…`
      : request.arguments

  return (
    <div className="tm-modal-overlay tm-modal-overlay--tool-approval">
      <div className="tm-modal tm-modal--narrow" onClick={(event) => event.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">工具调用授权</h2>
          {queue.length > 1 ? (
            <span className="tm-tool-approval-queue-hint">待处理 {queue.length} 项</span>
          ) : null}
        </header>
        <div className="tm-modal-body">
          <p className="tm-knowledge-detail-hint">
            当前权限模式下，写入或执行类工具需要您确认。普通模式下读取类工具会自动放行。
          </p>
          <p className="tm-tool-approval-tool-name">{request.toolName}</p>
          <pre className="tm-tool-approval-args">{preview || '（无参数）'}</pre>
        </div>
        <footer className="tm-modal-footer">
          <button
            type="button"
            className="tm-btn tm-btn--ghost"
            disabled={responding}
            onClick={() => void respond(false)}
          >
            拒绝
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={responding}
            onClick={() => void respond(true)}
          >
            允许
          </button>
        </footer>
      </div>
    </div>
  )
}
