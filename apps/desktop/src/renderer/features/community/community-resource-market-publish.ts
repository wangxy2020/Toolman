import type { CommunityResourceItem, CommunityResourceType } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { listCommunityResources } from './community-api.client'
import { isResourceRejectedLike } from './community-user-center-status'

interface Options {
  resourceType: CommunityResourceType
  profileId: string | null | undefined
  setPublishNotice: (message: string | null) => void
  setResumePublish: (item: CommunityResourceItem | null) => void
  setShowPublish: (show: boolean) => void
  t: TranslateFn
}

export async function openCommunityResourcePublish(options: Options) {
  const {
    resourceType,
    profileId,
    setPublishNotice,
    setResumePublish,
    setShowPublish,
    t,
  } = options
  setPublishNotice(null)
  if (!profileId) {
    setResumePublish(null)
    setShowPublish(true)
    return
  }
  try {
    const mine = await listCommunityResources({ resourceType, authorId: profileId, limit: 50 })
    const pending = mine.items.find((item) => item.status === 'pending_review')
    if (pending) {
      setPublishNotice(t('communityPage.market.pendingResourceReview', { title: pending.title }))
      return
    }
    const draft = mine.items.find((item) => item.status === 'draft')
    const rejected = mine.items.find((item) => isResourceRejectedLike(item))
    setResumePublish(rejected ?? draft ?? null)
    setShowPublish(true)
  } catch {
    setResumePublish(null)
    setShowPublish(true)
  }
}
