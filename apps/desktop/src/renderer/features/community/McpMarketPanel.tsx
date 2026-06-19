import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'

export function McpMarketPanel() {
  return (
    <CommunityResourceMarketPanel
      resourceType="mcp"
      title="MCP 市场"
      subtitle="探索社区推荐的 MCP 服务器与工具集成"
      publishLabel="发布MCP"
      emptyHint="暂无 MCP 资源，请确认 Community Hub 已启动并已发布资源"
    />
  )
}
