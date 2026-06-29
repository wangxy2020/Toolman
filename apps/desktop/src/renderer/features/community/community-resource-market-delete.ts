import type { CommunityResourceItem } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { deleteCommunityResource } from './community-api.client'
import { invalidateCommunityListCache } from './community-list-cache'
import { notifyCommunityUserDataChanged } from './community-events'
import { isUiMockCommunityId } from './community-ui-mock'

interface DeleteOptions {
  resourceToDelete: CommunityResourceItem | null
  selectedId: string | null
  setResourceToDelete: (item: CommunityResourceItem | null) => void
  setSelectedId: (id: string | null) => void
  setBusyItemId: (id: string | null) => void
  setBusyAction: (action: 'like' | 'dislike' | 'favorite' | 'install' | 'delete' | null) => void
  onReload: () => Promise<void>
  onSetError: (message: string) => void
  t: TranslateFn
}

export async function confirmCommunityResourceDelete({
  resourceToDelete,
  selectedId,
  setResourceToDelete,
  setSelectedId,
  setBusyItemId,
  setBusyAction,
  onReload,
  onSetError,
  t,
}: DeleteOptions) {
  if (!resourceToDelete) return
  const resourceId = resourceToDelete.id
  setBusyItemId(resourceId)
  setBusyAction('delete')
  try {
    if (!isUiMockCommunityId(resourceId)) {
      await deleteCommunityResource(resourceId)
    }
    setResourceToDelete(null)
    if (selectedId === resourceId) setSelectedId(null)
    invalidateCommunityListCache('resources:')
    await onReload()
    notifyCommunityUserDataChanged()
  } catch (deleteError) {
    const message =
      deleteError instanceof Error ? deleteError.message : t('communityPage.market.deleteResourceFailed')
    onSetError(message)
  } finally {
    setBusyItemId(null)
    setBusyAction(null)
  }
}
