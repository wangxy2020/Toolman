import { ConfirmDialog } from '../../components/ConfirmDialog'
import { CommunityMessagePublishModal } from './CommunityMessagePublishModal'
import { CommunityResourcePublishModal } from './CommunityResourcePublishModal'
import { TaskCreateModal } from './TaskCreateModal'
import { notifyCommunityUserDataChanged } from './community-events'
import { getUserCenterResourceLabel } from './user-center-panel-utils'
import type { UserCenterPanelState } from './useUserCenterPanel'

type PanelSlice = Pick<
  UserCenterPanelState,
  | 't'
  | 'resourceToWithdraw'
  | 'setResourceToWithdraw'
  | 'resumePublish'
  | 'editPublish'
  | 'resumeTask'
  | 'editTask'
  | 'resumeMessage'
  | 'editMessage'
  | 'messageToDelete'
  | 'setMessageToDelete'
  | 'taskToWithdraw'
  | 'setTaskToWithdraw'
  | 'taskToDelete'
  | 'setTaskToDelete'
  | 'handleConfirmWithdraw'
  | 'handleConfirmWithdrawTask'
  | 'handleConfirmDeleteTask'
  | 'handleConfirmDeleteMessage'
  | 'closePublishModal'
  | 'closeTaskModal'
  | 'closeMessageModal'
  | 'handlePublished'
>

export function UserCenterPanelModals({ panel }: { panel: PanelSlice }) {
  const {
    t,
    resourceToWithdraw,
    setResourceToWithdraw,
    resumePublish,
    editPublish,
    resumeTask,
    editTask,
    resumeMessage,
    editMessage,
    messageToDelete,
    setMessageToDelete,
    taskToWithdraw,
    setTaskToWithdraw,
    taskToDelete,
    setTaskToDelete,
    handleConfirmWithdraw,
    handleConfirmWithdrawTask,
    handleConfirmDeleteTask,
    handleConfirmDeleteMessage,
    closePublishModal,
    closeTaskModal,
    closeMessageModal,
    handlePublished,
  } = panel

  return (
    <>
      {resourceToWithdraw ? (
        <ConfirmDialog
          title={
            resourceToWithdraw.status === 'pending_review'
              ? t('communityPage.mine.confirm.withdrawResourceTitle')
              : t('communityPage.mine.confirm.deleteResourceTitle')
          }
          message={
            resourceToWithdraw.status === 'pending_review'
              ? t('communityPage.mine.confirm.withdrawResourceMessage', {
                  title: resourceToWithdraw.title,
                })
              : t('communityPage.mine.confirm.deleteResourceMessage', {
                  title: resourceToWithdraw.title,
                })
          }
          confirmLabel={
            resourceToWithdraw.status === 'pending_review'
              ? t('communityPage.mine.withdraw')
              : t('communityPage.mine.delete')
          }
          danger
          onCancel={() => setResourceToWithdraw(null)}
          onConfirm={() => void handleConfirmWithdraw()}
        />
      ) : null}

      {resumePublish || editPublish ? (
        <CommunityResourcePublishModal
          resourceType={(editPublish ?? resumePublish)!.resourceType}
          resourceLabel={
            getUserCenterResourceLabel((editPublish ?? resumePublish)!.resourceType, t) ??
            (editPublish ?? resumePublish)!.resourceType
          }
          resumeResource={editPublish ?? resumePublish}
          editOnly={Boolean(editPublish)}
          onClose={closePublishModal}
          onPublished={(message) => {
            handlePublished(message)
            closePublishModal()
            notifyCommunityUserDataChanged()
          }}
        />
      ) : null}

      {resumeTask || editTask ? (
        <TaskCreateModal
          resumeTask={editTask ?? resumeTask}
          editOnly={Boolean(editTask)}
          onClose={closeTaskModal}
          onCreated={(message) => {
            handlePublished(message)
            closeTaskModal()
          }}
        />
      ) : null}

      {resumeMessage || editMessage ? (
        <CommunityMessagePublishModal
          resumeMessage={editMessage ?? resumeMessage}
          editOnly={Boolean(editMessage)}
          onClose={closeMessageModal}
          onCreated={(message) => {
            handlePublished(message)
            closeMessageModal()
          }}
        />
      ) : null}

      {messageToDelete ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.deleteMessageTitle')}
          message={t('communityPage.mine.confirm.deleteMessageMessage')}
          confirmLabel={t('communityPage.mine.delete')}
          danger
          onCancel={() => setMessageToDelete(null)}
          onConfirm={() => void handleConfirmDeleteMessage()}
        />
      ) : null}

      {taskToWithdraw ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.withdrawTaskTitle')}
          message={t('communityPage.mine.confirm.withdrawTaskMessage', {
            title: taskToWithdraw.title,
          })}
          confirmLabel={t('communityPage.mine.withdraw')}
          danger
          onCancel={() => setTaskToWithdraw(null)}
          onConfirm={() => void handleConfirmWithdrawTask()}
        />
      ) : null}

      {taskToDelete ? (
        <ConfirmDialog
          title={t('communityPage.mine.confirm.deleteTaskTitle')}
          message={t('communityPage.mine.confirm.deleteTaskMessage', { title: taskToDelete.title })}
          confirmLabel={t('communityPage.mine.delete')}
          danger
          onCancel={() => setTaskToDelete(null)}
          onConfirm={() => void handleConfirmDeleteTask()}
        />
      ) : null}
    </>
  )
}
