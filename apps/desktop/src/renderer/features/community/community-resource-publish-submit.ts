import { type CommunityResourceItem } from '@toolman/shared'

import { parsePublishTags } from './community-publish-config'
import {
  createCommunityResource,
  getCommunityResource,
  patchCommunityResource,
  publishCommunityResource,
} from './community-api.client'
import { notifyCommunityUserDataChanged } from './community-events'
import { buildResourcePublishSuccessMessage } from './community-resource-status'
import { useI18n } from '../../i18n/useI18n'

type Translate = ReturnType<typeof useI18n>['t']

export async function submitCommunityResourcePublish({
  title,
  description,
  category,
  license,
  tags,
  version,
  changelog,
  packagePath,
  editOnly,
  resumeResource,
  isRejected,
  isDraftResume,
  isResume,
  resourceType,
  resourceLabel,
  requireReview,
  publishConfig,
  t,
  onPublished,
  onClose,
}: {
  title: string
  description: string
  category: string
  license: string
  tags: string
  version: string
  changelog: string
  packagePath: string
  editOnly: boolean
  resumeResource: CommunityResourceItem | null
  isRejected: boolean
  isDraftResume: boolean
  isResume: boolean
  resourceType: CommunityResourceItem['resourceType']
  resourceLabel: string
  requireReview: boolean
  publishConfig: { manifestFile: string }
  t: Translate
  onPublished?: (message: string) => void
  onClose: () => void
}): Promise<{ error: string | null; succeeded: boolean }> {
  if (!title.trim()) {
    return { error: t('communityPage.resourcePublish.fillTitle'), succeeded: false }
  }
  if (!editOnly && !packagePath) {
    return {
      error: requireReview
        ? t('communityPage.resourcePublish.selectPackageReview')
        : t('communityPage.resourcePublish.selectPackagePublish'),
      succeeded: false,
    }
  }

  let createdId: string | undefined = resumeResource?.id
  try {
    if (editOnly && resumeResource) {
      await patchCommunityResource({
        id: resumeResource.id,
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        license: license.trim() || undefined,
        tags: parsePublishTags(tags),
      })
      notifyCommunityUserDataChanged()
      onPublished?.(t('communityPage.resourcePublish.successEdit'))
      onClose()
      return { error: null, succeeded: true }
    }

    const resourceId =
      resumeResource?.id ??
      (
        await createCommunityResource({
          title: title.trim(),
          description: description.trim() || undefined,
          resourceType,
          category: category.trim() || undefined,
          license: license.trim() || undefined,
          tags: parsePublishTags(tags),
        })
      ).id
    createdId = resourceId

    if (resumeResource && (isRejected || isDraftResume)) {
      await patchCommunityResource({
        id: resourceId,
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        license: license.trim() || undefined,
        tags: parsePublishTags(tags),
      })
    }

    const published = await publishCommunityResource({
      id: resourceId,
      resourceType,
      version: version.trim() || '1.0.0',
      changelog: changelog.trim() || undefined,
      packagePath,
    })
    notifyCommunityUserDataChanged()
    const successMessage = buildResourcePublishSuccessMessage(published.status, requireReview, t)
    onPublished?.(successMessage)
    onClose()
    return { error: null, succeeded: true }
  } catch (submitError) {
    const message =
      submitError instanceof Error
        ? submitError.message
        : t('communityPage.resourcePublish.publishFailed', { label: resourceLabel })
    const isMultipartError = message.toLowerCase().includes('multipart')
    const isChecksumError = message.toLowerCase().includes('sha256sums')
    if (createdId && !isMultipartError) {
      try {
        const existing = await getCommunityResource(createdId)
        if (existing.status === 'pending_review' || existing.status === 'published') {
          notifyCommunityUserDataChanged()
          onPublished?.(buildResourcePublishSuccessMessage(existing.status, requireReview, t))
          onClose()
          return { error: null, succeeded: true }
        }
      } catch {
        // fall through to error display
      }
    }
    return {
      error: isChecksumError
        ? t('communityPage.resourcePublish.checksumHint', {
            message,
            manifest: publishConfig.manifestFile,
          })
        : isMultipartError
          ? t('communityPage.resourcePublish.multipartHint', { message })
          : createdId && !isResume
            ? t('communityPage.resourcePublish.draftSavedHint', { message })
            : message,
      succeeded: false,
    }
  }
}
