import type { FC } from 'react'

import { PROJECT_TYPE_OPTIONS, parseProjectType } from './pm-project-info-dialog-utils'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<ProjectInfoDialogState, 't' | 'draft' | 'patchDraft' | 'projectTypeLabel'>

export const ProjectInfoDialogOverviewTab: FC<Props> = ({ t, draft, patchDraft, projectTypeLabel }) => (
  <div className="tm-kb-settings-form">
    <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.overviewHint')}</p>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-code">
        {t('projectManagerPage.projectInfo.fieldCode')}
      </label>
      <input
        id="pm-info-code"
        className="tm-kb-settings-input"
        value={draft.code}
        onChange={(event) => patchDraft({ code: event.target.value })}
      />
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-name">
        {t('projectManagerPage.projectInfo.fieldName')}
      </label>
      <input
        id="pm-info-name"
        className="tm-kb-settings-input"
        value={draft.name}
        onChange={(event) => patchDraft({ name: event.target.value })}
      />
    </div>
    <div className="tm-kb-settings-row">
      <label className="tm-kb-settings-label" htmlFor="pm-info-project-type">
        {t('projectManagerPage.projectInfo.fieldProjectType')}
      </label>
      <select
        id="pm-info-project-type"
        className="tm-kb-settings-input"
        value={draft.projectType}
        onChange={(event) => patchDraft({ projectType: parseProjectType(event.target.value) })}>
        {PROJECT_TYPE_OPTIONS.map((type) => (
          <option key={type} value={type}>
            {projectTypeLabel(type)}
          </option>
        ))}
      </select>
    </div>
    <div className="tm-kb-settings-row tm-kb-settings-row--stack">
      <label className="tm-kb-settings-label" htmlFor="pm-info-description">
        {t('projectManagerPage.projectInfo.fieldDescription')}
      </label>
      <textarea
        id="pm-info-description"
        className="tm-kb-settings-input tm-kb-settings-textarea"
        rows={4}
        value={draft.description}
        onChange={(event) => patchDraft({ description: event.target.value })}
      />
    </div>
  </div>
)
