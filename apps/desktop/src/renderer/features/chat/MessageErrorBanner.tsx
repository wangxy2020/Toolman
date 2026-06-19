import { useState } from 'react'
import type { IpcError } from '@toolman/shared'
import { IconChevronRight } from '../../components/icons'
import type { MessageSettings } from './message-settings'
import { getErrorTitle } from './message-error-utils'
import { MessageErrorDetailModal } from './MessageErrorDetailModal'

function IconWarning({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

interface Props {
  error: IpcError
  modelId: string | null
  messageSettings: MessageSettings
}

export function MessageErrorBanner({ error, modelId, messageSettings }: Props) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <>
      <div className="tm-stream-error-box">
        <div className="tm-stream-error-main">
          <span className="tm-stream-error-icon" aria-hidden="true">
            <IconWarning />
          </span>
          <div className="tm-stream-error-text">
            <div className="tm-stream-error-title">{getErrorTitle(error)}</div>
            <div className="tm-stream-error-subtitle">{error.message}</div>
          </div>
        </div>
        <button
          type="button"
          className="tm-stream-error-detail-link"
          onClick={() => setShowDetails(true)}
        >
          详情
          <IconChevronRight size={12} />
        </button>
      </div>

      {showDetails && (
        <MessageErrorDetailModal
          error={error}
          modelId={modelId}
          messageSettings={messageSettings}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  )
}
