import { useI18n } from '../../i18n/useI18n'
import { CommunityPublishModalShell } from './CommunityPublishModalShell'
import { NewsSourcesPanel } from './NewsSourcesPanel'

interface Props {
  onClose: () => void
  onFetched?: () => void
}

export function NewsSourcesModal({ onClose, onFetched }: Props) {
  const { t } = useI18n()

  return (
    <CommunityPublishModalShell
      title={t('communityPage.newsSources.title')}
      ariaLabel={t('communityPage.newsSources.title')}
      onClose={onClose}
      footer={
        <div className="tm-community-publish-modal-footer-actions">
          <button
            type="button"
            className="tm-community-publish-modal-footer-btn tm-community-publish-modal-footer-btn--secondary"
            onClick={onClose}
          >
            {t('communityPage.publish.close')}
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
