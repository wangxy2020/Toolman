import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'

export function SkillsMarketPanel() {
  return (
    <CommunityResourceMarketPanel
      resourceType="skill"
      title="Skills 市场"
      subtitle="发现与安装社区贡献的 Agent Skills"
      publishLabel="发布Skills"
      emptyHint="暂无 Skill 资源，请确认 Community Hub 已启动并已发布资源"
    />
  )
}
