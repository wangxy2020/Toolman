import type { FC } from 'react'

import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<ProjectInfoDialogState, 't' | 'domainTabLabel'>

export const ProjectInfoDialogDomainTab: FC<Props> = ({ t, domainTabLabel }) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">
      {t('projectManagerPage.projectInfo.domainPlaceholderHint', { domain: domainTabLabel })}
    </p>
    <div className="tm-pm-project-info-domain-placeholder" role="status">
      {t('projectManagerPage.projectInfo.domainPlaceholderEmpty')}
    </div>
  </div>
)
