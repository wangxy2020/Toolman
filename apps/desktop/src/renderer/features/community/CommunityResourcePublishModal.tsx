import {
  CommunityPublishModalError,
  CommunityPublishModalFooterActions,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'
import { CommunityResourcePublishFormFields } from './CommunityResourcePublishFormFields'
import { CommunityResourcePublishPackageSection } from './CommunityResourcePublishPackageSection'
import {
  type CommunityResourcePublishModalProps,
} from './community-resource-publish-types'
import { useCommunityResourcePublishModal } from './useCommunityResourcePublishModal'

export type { CommunityResourcePublishModalProps } from './community-resource-publish-types'

export function CommunityResourcePublishModal(props: CommunityResourcePublishModalProps) {
  const form = useCommunityResourcePublishModal(props)
  const {
    t,
    editOnly,
    isDraftResume,
    isRejected,
    showPackageUpload,
    submitting,
    error,
    packageNotice,
    packagingKb,
    packagingMcp,
    preparingPackage,
    submitLabel,
    modalTitle,
    handleSubmit,
    handleClose,
  } = form

  return (
    <CommunityPublishModalShell
      title={modalTitle}
      onClose={handleClose}
      footer={
        <CommunityPublishModalFooterActions
          onCancel={handleClose}
          cancelDisabled={submitting}
          confirmLabel={submitting ? t('communityPage.publish.submitting') : submitLabel}
          confirmDisabled={submitting || packagingKb || packagingMcp || preparingPackage}
          onConfirm={() => void handleSubmit()}
        />
      }
    >
      {error ? <CommunityPublishModalError message={error} /> : null}
      {packageNotice ? <CommunityPublishModalNotice message={packageNotice} /> : null}
      {isDraftResume && !editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.resourcePublish.draftUploadNotice')} />
      ) : null}
      {isRejected && !editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.resourcePublish.rejectedNotice')} />
      ) : null}
      {editOnly ? (
        <CommunityPublishModalNotice message={t('communityPage.resourcePublish.editNotice')} />
      ) : null}

      <CommunityResourcePublishFormFields form={form} />
      {showPackageUpload ? <CommunityResourcePublishPackageSection form={form} /> : null}
    </CommunityPublishModalShell>
  )
}
