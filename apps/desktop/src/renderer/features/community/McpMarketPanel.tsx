import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'
import { useI18n } from '../../i18n/useI18n'

export function McpMarketPanel() {
  const { t } = useI18n()
  return (
    <CommunityResourceMarketPanel
      resourceType="mcp"
      title={t('communityPage.panels.mcp.title')}
      subtitle={t('communityPage.panels.mcp.subtitle')}
      publishLabel={t('communityPage.panels.mcp.publish')}
      emptyHint={t('communityPage.market.mcpEmpty')}
    />
  )
}
