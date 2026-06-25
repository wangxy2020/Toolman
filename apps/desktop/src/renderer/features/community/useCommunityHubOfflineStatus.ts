import type { CommunityHubStatusOutput } from '@toolman/shared'

import { useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'

export function useCommunityHubOfflineStatus(status: CommunityHubStatusOutput | null) {
  const { t } = useI18n()
  useRegisterModulePanelStatus(
    'community-hub-offline',
    status?.offlineReadOnly
      ? {
          tone: 'warning',
          message: status.error ?? t('communityPage.hubOfflineHint'),
        }
      : null,
  )
}
