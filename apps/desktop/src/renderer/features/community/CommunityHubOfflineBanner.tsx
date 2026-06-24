import type { CommunityHubStatusOutput } from '@toolman/shared'

interface Props {
  status: CommunityHubStatusOutput | null
}

export function CommunityHubOfflineBanner({ status }: Props) {
  if (!status?.offlineReadOnly) return null

  return (
    <div className="tm-community-offline-banner" role="status">
      <strong>社区 Hub 离线</strong>
      <span>
        {status.error ??
          '当前为本地缓存只读模式，发布、点赞等写操作暂不可用。恢复网络后将自动重新连接官方 Hub。'}
      </span>
    </div>
  )
}
