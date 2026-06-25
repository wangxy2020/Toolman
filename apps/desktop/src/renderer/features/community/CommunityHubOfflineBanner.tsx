import type { CommunityHubStatusOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  status: CommunityHubStatusOutput | null
}

export function CommunityHubOfflineBanner({ status }: Props) {
  const { t } = useI18n()
  if (!status?.offlineReadOnly) return null

  return (
    <div className="tm-community-offline-banner" role="status">
      <strong>{t('communityPage.hubOffline')}</strong>
      <span>
        {status.error ??
          t('communityPage.hubOfflineHint')}
      </span>
    </div>
  )
}
