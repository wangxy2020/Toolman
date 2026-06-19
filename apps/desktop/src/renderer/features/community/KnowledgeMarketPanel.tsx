import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'

export function KnowledgeMarketPanel() {
  return (
    <CommunityResourceMarketPanel
      resourceType="knowledge"
      title="知识库市场"
      subtitle="浏览与安装社区公开的知识库合集"
      publishLabel="发布知识库"
      emptyHint="暂无知识库资源，请确认 Community Hub 已启动并已发布资源"
    />
  )
}
