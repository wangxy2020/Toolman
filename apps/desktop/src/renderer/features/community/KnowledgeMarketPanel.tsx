import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'
import { useI18n } from '../../i18n/useI18n'

export function KnowledgeMarketPanel() {
  const { t } = useI18n()
  return (
    <CommunityResourceMarketPanel
      resourceType="knowledge"
      title={t('communityPage.panels.knowledge.title')}
      subtitle={t('communityPage.panels.knowledge.subtitle')}
      publishLabel={t('communityPage.panels.knowledge.publish')}
      emptyHint={t('communityPage.market.knowledgeEmpty')}
    />
  )
}
