import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type ToolApprovalRequest } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { resolveToolDisplayMeta } from './tool-display-meta'

const DOCX_MCP_BATCH_TOOL_NAME = '__docx_mcp_batch__'
const EXCEL_MCP_BATCH_TOOL_NAME = '__excel_mcp_batch__'

function parseBatchApproval(argumentsJson: string): {
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
  const { t } = useI18n()
  const [queue, setQueue] = useState<ToolApprovalRequest[]>([])
  const [responding, setResponding] = useState(false)
  const request = queue[0] ?? null
  const isDocxBatch = request?.toolName === DOCX_MCP_BATCH_TOOL_NAME
  const isExcelBatch = request?.toolName === EXCEL_MCP_BATCH_TOOL_NAME
  const isBatchApproval = isDocxBatch || isExcelBatch
  const batchApproval = useMemo(
    () => (isBatchApproval && request ? parseBatchApproval(request.arguments) : null),
    [isBatchApproval, request],
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
    () => (request && !isBatchApproval ? resolveToolDisplayMeta(request.toolName) : null),
    [request, isBatchApproval],
  )

  if (!request) return null

  const preview =
    request.arguments.length > 1200
      ? `${request.arguments.slice(0, 1200)}…`
      : request.arguments

  const title = isDocxBatch
    ? t('toolApprovalPage.title.docxBatch')
    : isExcelBatch
      ? t('toolApprovalPage.title.excelBatch')
      : t('toolApprovalPage.title.default')

  return (
    <div className="tm-modal-overlay tm-modal-overlay--tool-approval">
      <div className="tm-modal tm-modal--narrow" onClick={(event) => event.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{title}</h2>
          {queue.length > 1 ? (
            <span className="tm-tool-approval-queue-hint">
              {t('toolApprovalPage.queueHint', { count: queue.length })}
            </span>
          ) : null}
        </header>
        <div className="tm-modal-body">
          {isBatchApproval ? (
            <>
              <p className="tm-knowledge-detail-hint">
                {isExcelBatch
                  ? t('toolApprovalPage.batchHint.excel')
                  : t('toolApprovalPage.batchHint.docx')}
              </p>
              {batchApproval?.summary ? (
                <p className="tm-tool-approval-tool-name">{batchApproval.summary}</p>
              ) : null}
              {batchApproval?.files.length ? (
                <ul className="tm-tool-approval-file-list">
                  {batchApproval.files.map((file) => (
                    <li key={file} className="tm-tool-approval-file-item">
                      {file}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <>
              <p className="tm-knowledge-detail-hint">{t('toolApprovalPage.permissionHint')}</p>
              {meta ? <p className="tm-tool-approval-tool-name">{meta.title}</p> : null}
              {meta?.description ? (
                <p className="tm-knowledge-detail-hint">{meta.description}</p>
              ) : null}
              <pre className="tm-tool-approval-args">{preview || t('toolApprovalPage.noArgs')}</pre>
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
            {t('toolApprovalPage.reject')}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={responding}
            onClick={() => void respond(true)}
          >
            {isBatchApproval ? t('toolApprovalPage.allowAll') : t('toolApprovalPage.allow')}
          </button>
        </footer>
      </div>
    </div>
  )
}
