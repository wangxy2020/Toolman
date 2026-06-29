import { AdminModerationAdminSection } from './AdminModerationAdminSection'
import { AdminModerationLogsSection } from './AdminModerationLogsSection'
import { AdminModerationOnlineSection } from './AdminModerationOnlineSection'
import { AdminModerationResourcesSection } from './AdminModerationResourcesSection'
import { AdminModerationReviewSection } from './AdminModerationReviewSection'
import type { AdminModerationPanelState } from './useAdminModerationPanel'
import type { PendingAction } from './admin-moderation-panel-types'

export function AdminModerationFeedBody({
  panel,
  setPending,
}: {
  panel: AdminModerationPanelState
  setPending: (action: PendingAction) => void
}) {
  return (
    <>
      <AdminModerationResourcesSection panel={panel} setPending={setPending} />
      <AdminModerationReviewSection panel={panel} setPending={setPending} />
      <AdminModerationOnlineSection panel={panel} setPending={setPending} />
      <AdminModerationAdminSection panel={panel} setPending={setPending} />
      <AdminModerationLogsSection panel={panel} />
    </>
  )
}
