import { useState } from 'react'
import type { IpcError } from '@toolman/shared'
import type { MessageSettings } from './message-settings'
import { MessageMarkdown } from './MessageMarkdown'
import {
  formatErrorForCopy,
  getErrorName,
  getErrorStack,
} from './message-error-utils'
import { useErrorDiagnosis } from './useErrorDiagnosis'

interface Props {
  error: IpcError
  modelId: string | null
  messageSettings: MessageSettings
  onClose: () => void
}

export function MessageErrorDetailModal({
  error,
  modelId,
  messageSettings,
  onClose,
}: Props) {
  const stack = getErrorStack(error)
  const { diagnose, diagnosing } = useErrorDiagnosis()
  const [diagnosis, setDiagnosis] = useState<string | null>(null)
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatErrorForCopy(error))
  }

  const handleDiagnose = async () => {
    if (!modelId || diagnosing) return
    setDiagnoseError(null)
    try {
      const result = await diagnose({
        modelId,
        errorSummary: formatErrorForCopy(error),
      })
      setDiagnosis(result.text)
    } catch (err) {
      setDiagnosis(null)
      setDiagnoseError(err instanceof Error ? err.message : '诊断失败')
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-error-detail-modal tm-settings-form-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">错误详情</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          <div className="tm-form-field">
            <label className="tm-form-label">错误名称</label>
            <input className="tm-form-input" readOnly value={getErrorName(error)} />
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">错误信息</label>
            <div className="tm-error-detail-readonly">{error.message}</div>
          </div>

          <div className="tm-form-field">
            <label className="tm-form-label">堆栈信息</label>
            <pre className="tm-error-detail-readonly tm-error-detail-stack">
              {stack || '无堆栈信息'}
            </pre>
          </div>

          {diagnosis ? (
            <div className="tm-form-field">
              <label className="tm-form-label">AI 诊断</label>
              <div className="tm-error-detail-diagnosis">
                <MessageMarkdown text={diagnosis} settings={messageSettings} />
              </div>
            </div>
          ) : null}

          {diagnoseError ? (
            <div className="tm-error-detail-diagnose-error">{diagnoseError}</div>
          ) : null}
        </div>

        <div className="tm-modal-footer">
          <div className="tm-modal-footer-actions">
            <button type="button" className="tm-btn" onClick={() => void handleCopy()}>
              复制
            </button>
            <button
              type="button"
              className="tm-btn tm-btn-primary"
              disabled={!modelId || diagnosing}
              title={modelId ? undefined : '当前没有可用模型'}
              onClick={() => void handleDiagnose()}
            >
              {diagnosing ? '诊断中…' : diagnosis ? '重新诊断' : 'AI 诊断'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
