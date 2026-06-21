import { useEffect } from 'react'

import {
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'
import { NewsSourcesPanel } from './NewsSourcesPanel'

interface Props {
  onClose: () => void
  onFetched?: () => void
}

export function NewsSourcesModal({ onClose, onFetched }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <CommunityPublishModalShell
      title="RSS 源管理"
      ariaLabel="RSS 源管理"
      onClose={onClose}
      footer={
        <div className="tm-community-publish-modal-footer-actions">
          <button
            type="button"
            className="tm-community-publish-modal-footer-btn tm-community-publish-modal-footer-btn--secondary"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      }
    >
      <NewsSourcesPanel
        onChanged={() => {
          onFetched?.()
        }}
      />
    </CommunityPublishModalShell>
  )
}
