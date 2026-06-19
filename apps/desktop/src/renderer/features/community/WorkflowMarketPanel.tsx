import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'

export function WorkflowMarketPanel() {
  return (
    <CommunityResourceMarketPanel
      resourceType="workflow"
      title="工作流市场"
      subtitle="浏览与导入社区共享的自动化工作流"
      publishLabel="发布工作流"
      emptyHint="暂无工作流资源，请确认 Community Hub 已启动并已发布资源"
    />
  )
}
