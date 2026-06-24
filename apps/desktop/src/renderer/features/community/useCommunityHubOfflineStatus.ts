import { useRegisterModulePanelStatus } from '../../components/module-page-status'
import type { CommunityHubStatusOutput } from '@toolman/shared'

export function useCommunityHubOfflineStatus(status: CommunityHubStatusOutput | null) {
  useRegisterModulePanelStatus(
    'community-hub-offline',
    status?.offlineReadOnly
      ? {
          tone: 'warning',
          message:
            status.error ??
            '社区 Hub 离线，当前为本地缓存只读模式，发布、点赞等写操作暂不可用。恢复网络后将自动重新连接官方 Hub。',
        }
      : null,
  )
}
