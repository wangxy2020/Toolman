import {
  type CommunityModerationReport,
  type CommunityModerationReportResolveInput,
} from '@toolman/shared'

export type PendingAction =
  | {
      kind: 'suspend-resource'
      resourceId: string
      title: string
      reviewReject?: boolean
    }
  | {
      kind: 'ban-user'
      userId: string
      label: string
    }
  | {
      kind: 'resolve-report'
      report: CommunityModerationReport
      action: CommunityModerationReportResolveInput['action']
    }
  | {
      kind: 'ban-device'
      deviceId: string
      userId: string
      deviceName: string
      userName: string
    }
  | {
      kind: 'delete-message'
      messageId: string
      preview: string
    }
  | {
      kind: 'cancel-task'
      taskId: string
      title: string
      reviewReject?: boolean
    }
  | {
      kind: 'approve-resource'
      resourceId: string
      title: string
    }
  | {
      kind: 'approve-task'
      taskId: string
      title: string
    }
  | {
      kind: 'appoint-admin'
      userId: string
      label: string
    }
  | {
      kind: 'revoke-admin'
      userId: string
      label: string
    }
  | {
      kind: 'unban-user'
      userId: string
      label: string
    }
  | {
      kind: 'unban-device'
      deviceId: string
      label: string
    }

export type BlacklistEntry =
  | {
      kind: 'user'
      key: string
      userName: string
      deviceId: string
      userId: string
    }
  | {
      kind: 'device'
      key: string
      userName: string
      deviceId: string
      deviceRecordId: string
    }
