import { CommunityResourceMarketPanel } from './CommunityResourceMarketPanel'
import { useI18n } from '../../i18n/useI18n'

export function SkillsMarketPanel() {
  const { t } = useI18n()
  return (
    <CommunityResourceMarketPanel
      resourceType="skill"
      title={t('communityPage.panels.skills.title')}
      subtitle={t('communityPage.panels.skills.subtitle')}
      publishLabel={t('communityPage.panels.skills.publish')}
      emptyHint={t('communityPage.market.skillsEmpty')}
    />
  )
}
