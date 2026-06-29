import { useMemo, useState } from 'react'

import {
  type CommunityBoardMessage,
  type CommunityResourceItem,
  type CommunityTaskItem,
} from '@toolman/shared'

import {
  cancelCommunityTask,
  deleteCommunityBoardMessage,
  deleteCommunityResource,
  deleteCommunityTask,
} from './community-api.client'
import { notifyCommunityBoardChanged, notifyCommunityUserDataChanged } from './community-events'
import { isUiMockCommunityId } from './community-ui-mock'
import { useCommunityCommentExpansion } from './useCommunityCommentExpansion'
import { useCommunityUserCenter, type UserCenterSection } from './useCommunityUserCenter'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'
import { getSectionCount } from './user-center-panel-utils'

export function useUserCenterPanel() {
  const { t } = useI18n()
  const [section, setSection] = useState<UserCenterSection>('publishes')
  const [resourceToWithdraw, setResourceToWithdraw] = useState<CommunityResourceItem | null>(null)
  const [resumePublish, setResumePublish] = useState<CommunityResourceItem | null>(null)
  const [editPublish, setEditPublish] = useState<CommunityResourceItem | null>(null)
  const [resumeTask, setResumeTask] = useState<CommunityTaskItem | null>(null)
  const [editTask, setEditTask] = useState<CommunityTaskItem | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<CommunityTaskItem | null>(null)
  const [taskToWithdraw, setTaskToWithdraw] = useState<CommunityTaskItem | null>(null)
  const [resumeMessage, setResumeMessage] = useState<CommunityBoardMessage | null>(null)
  const [editMessage, setEditMessage] = useState<CommunityBoardMessage | null>(null)
  const [messageToDelete, setMessageToDelete] = useState<CommunityBoardMessage | null>(null)
  const [publishNotice, setPublishNotice] = useState<string | null>(null)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const center = useCommunityUserCenter()
  const comments = useCommunityCommentExpansion()
  const profile = center.profile
  const activeCount = useMemo(() => getSectionCount(section, center), [section, center])

  const handleConfirmWithdraw = async () => {
    if (!resourceToWithdraw) return
    setWithdrawingId(resourceToWithdraw.id)
    try {
      await deleteCommunityResource(resourceToWithdraw.id)
      notifyCommunityUserDataChanged()
      setResourceToWithdraw(null)
      await center.load()
    } catch (withdrawErr) {
      const message =
        withdrawErr instanceof Error ? withdrawErr.message : t('communityPage.mine.errors.deleteFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const handleConfirmWithdrawTask = async () => {
    if (!taskToWithdraw) return
    setWithdrawingId(taskToWithdraw.id)
    try {
      await cancelCommunityTask(taskToWithdraw.id)
      notifyCommunityUserDataChanged()
      setTaskToWithdraw(null)
      await center.load()
    } catch (withdrawErr) {
      const message =
        withdrawErr instanceof Error ? withdrawErr.message : t('communityPage.mine.errors.withdrawFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return
    setWithdrawingId(taskToDelete.id)
    try {
      await deleteCommunityTask(taskToDelete.id)
      notifyCommunityUserDataChanged()
      setTaskToDelete(null)
      await center.load()
    } catch (deleteErr) {
      const message =
        deleteErr instanceof Error ? deleteErr.message : t('communityPage.mine.errors.deleteTaskFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const closePublishModal = () => {
    setResumePublish(null)
    setEditPublish(null)
  }

  const closeTaskModal = () => {
    setResumeTask(null)
    setEditTask(null)
  }

  const closeMessageModal = () => {
    setResumeMessage(null)
    setEditMessage(null)
  }

  const handleConfirmDeleteMessage = async () => {
    if (!messageToDelete) return
    setWithdrawingId(messageToDelete.id)
    try {
      if (!isUiMockCommunityId(messageToDelete.id)) {
        await deleteCommunityBoardMessage(messageToDelete.id)
      }
      notifyCommunityBoardChanged()
      notifyCommunityUserDataChanged()
      setMessageToDelete(null)
      await center.load()
    } catch (deleteErr) {
      const message =
        deleteErr instanceof Error ? deleteErr.message : t('communityPage.mine.errors.deleteMessageFailed')
      setWithdrawError(message)
    } finally {
      setWithdrawingId(null)
    }
  }

  const handlePublished = (message: string) => {
    setPublishNotice(message)
    void center.load()
  }

  useRegisterModulePanelError('community-user-center-profile', center.profileError)
  useRegisterModulePanelError('community-user-center', center.error)
  useRegisterModulePanelError('community-user-center-withdraw', withdrawError, () =>
    setWithdrawError(null),
  )
  useRegisterModulePanelStatus(
    'community-user-center-loading',
    center.loading || center.profileLoading
      ? { tone: 'info', message: t('communityPage.mine.loading') }
      : publishNotice
        ? { tone: 'info', message: publishNotice }
        : null,
  )

  return {
    t,
    section,
    setSection,
    resourceToWithdraw,
    setResourceToWithdraw,
    resumePublish,
    setResumePublish,
    editPublish,
    setEditPublish,
    resumeTask,
    setResumeTask,
    editTask,
    setEditTask,
    taskToDelete,
    setTaskToDelete,
    taskToWithdraw,
    setTaskToWithdraw,
    resumeMessage,
    setResumeMessage,
    editMessage,
    setEditMessage,
    messageToDelete,
    setMessageToDelete,
    publishNotice,
    setPublishNotice,
    withdrawingId,
    center,
    comments,
    profile,
    activeCount,
    handleConfirmWithdraw,
    handleConfirmWithdrawTask,
    handleConfirmDeleteTask,
    handleConfirmDeleteMessage,
    closePublishModal,
    closeTaskModal,
    closeMessageModal,
    handlePublished,
  }
}

export type UserCenterPanelState = ReturnType<typeof useUserCenterPanel>
