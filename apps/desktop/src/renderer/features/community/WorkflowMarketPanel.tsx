import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'
import { useI18n } from '../../i18n/useI18n'

export function WorkflowMarketPanel() {
  const { t } = useI18n()
  return (
    <CommunityResourceMarketPanel
      resourceType="workflow"
      title={t('communityPage.panels.workflow.title')}
      subtitle={t('communityPage.panels.workflow.subtitle')}
      publishLabel={t('communityPage.panels.workflow.publish')}
      emptyHint={t('communityPage.market.workflowEmpty')}
    />
  )
}
