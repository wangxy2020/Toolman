import type { CommunityModerationScanResource, CommunityModerationScanTask } from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import {
  ModerationReviewResourceCard,
  ModerationReviewTaskCard,
} from './ModerationReviewQueueCards'

interface Props {
  resources: CommunityModerationScanResource[]
  tasks: CommunityModerationScanTask[]
  acting: boolean
  onApproveResource: (resource: CommunityModerationScanResource) => void
  onRejectResource: (resource: CommunityModerationScanResource) => void
  onApproveTask: (task: CommunityModerationScanTask) => void
  onRejectTask: (task: CommunityModerationScanTask) => void
}

export function ModerationReviewQueue({
  resources,
  tasks,
  acting,
  onApproveResource,
  onRejectResource,
  onApproveTask,
  onRejectTask,
}: Props) {
  const { t } = useI18n()

  if (resources.length === 0 && tasks.length === 0) {
    return <div className="tm-user-center-empty">{t('communityPage.admin.reviewQueue.empty')}</div>
  }

  return (
    <>
      <p className="tm-community-moderation-review-hint">{t('communityPage.admin.reviewQueue.hint')}</p>
      <ul className="tm-kb-file-list tm-community-moderation-review-list">
        {resources.map((resource) => (
          <ModerationReviewResourceCard
            key={`resource-${resource.id}`}
            resource={resource}
            acting={acting}
            onApprove={() => onApproveResource(resource)}
            onReject={() => onRejectResource(resource)}
          />
        ))}
        {tasks.map((task) => (
          <ModerationReviewTaskCard
            key={`task-${task.id}`}
            task={task}
            acting={acting}
            onApprove={() => onApproveTask(task)}
            onReject={() => onRejectTask(task)}
          />
        ))}
      </ul>
    </>
  )
}
