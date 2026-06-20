import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type ToolApprovalRequest } from '@toolman/shared'

import { resolveToolDisplayMeta } from './tool-display-meta'

const DOCX_MCP_BATCH_TOOL_NAME = '__docx_mcp_batch__'

function parseDocxBatchApproval(argumentsJson: string): {
  summary?: string
  files: string[]
} {
  try {
    const parsed = JSON.parse(argumentsJson) as { summary?: string; files?: string[] }
    return {
      summary: parsed.summary,
      files: Array.isArray(parsed.files) ? parsed.files.filter(Boolean) : [],
    }
  } catch {
    return { files: [] }
  }
}

export function ToolApprovalModal() {
  const [queue, setQueue] = useState<ToolApprovalRequest[]>([])
  const [responding, setResponding] = useState(false)
  const request = queue[0] ?? null
  const isDocxBatch = request?.toolName === DOCX_MCP_BATCH_TOOL_NAME
  const docxBatch = useMemo(
    () => (isDocxBatch && request ? parseDocxBatchApproval(request.arguments) : null),
    [isDocxBatch, request],
  )

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

  const meta = useMemo(
    () => (request && !isDocxBatch ? resolveToolDisplayMeta(request.toolName) : null),
    [request, isDocxBatch],
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
          <h2 className="tm-modal-title">
            {isDocxBatch ? 'Word 文档编辑授权' : '工具调用授权'}
          </h2>
          {queue.length > 1 ? (
            <span className="tm-tool-approval-queue-hint">待处理 {queue.length} 项</span>
          ) : null}
        </header>
        <div className="tm-modal-body">
          {isDocxBatch ? (
            <>
              <p className="tm-knowledge-detail-hint">
                本次将依次调用多个 DOCX 编辑工具（批注、替换、段落修改等）。允许后，本次任务内后续
                DOCX 工具将自动执行，不再逐项询问。
              </p>
              {docxBatch?.summary ? (
                <p className="tm-tool-approval-tool-name">{docxBatch.summary}</p>
              ) : null}
              {docxBatch?.files.length ? (
                <ul className="tm-tool-approval-file-list">
                  {docxBatch.files.map((file) => (
                    <li key={file} className="tm-tool-approval-file-item">
                      {file}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <p className="tm-knowledge-detail-hint">
                当前权限模式下，写入或执行类工具需要您确认。普通模式下读取类工具会自动放行。
              </p>
              {meta ? <p className="tm-tool-approval-tool-name">{meta.title}</p> : null}
              {meta?.description ? (
                <p className="tm-knowledge-detail-hint">{meta.description}</p>
              ) : null}
              <pre className="tm-tool-approval-args">{preview || '（无参数）'}</pre>
            </>
          )}
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
            {isDocxBatch ? '允许本次全部' : '允许'}
          </button>
        </footer>
      </div>
    </div>
  )
}
