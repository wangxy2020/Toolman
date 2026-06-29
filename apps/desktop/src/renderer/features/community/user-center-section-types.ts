import type { UserCenterPanelState } from './useUserCenterPanel'

export type UserCenterSectionPanel = Pick<
  UserCenterPanelState,
  | 't'
  | 'center'
  | 'comments'
  | 'profile'
  | 'withdrawingId'
  | 'setPublishNotice'
  | 'setResumePublish'
  | 'setEditPublish'
  | 'setResumeMessage'
  | 'setEditMessage'
  | 'setMessageToDelete'
  | 'setResourceToWithdraw'
  | 'setResumeTask'
  | 'setEditTask'
  | 'setTaskToDelete'
  | 'setTaskToWithdraw'
>
