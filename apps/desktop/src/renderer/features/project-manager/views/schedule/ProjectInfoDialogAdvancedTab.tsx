import type { FC } from 'react'

import { ProjectInfoDialogAdvancedHistory } from './ProjectInfoDialogAdvancedHistory'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<
  ProjectInfoDialogState,
  | 't'
  | 'isFeaturesInfo'
  | 'isWorkspaceCatalog'
  | 'draft'
  | 'patchDraft'
  | 'isResourceInfo'
  | 'isCreate'
  | 'isWorkspaceResource'
  | 'isCostInfo'
  | 'isWorkspaceCost'
  | 'isWorkspaceFeatures'
  | 'project'
  | 'lastSavedAt'
  | 'dateInputLang'
  | 'resourceVersion'
  | 'resourceHistoryRows'
  | 'costVersion'
  | 'costHistoryRows'
  | 'featureVersion'
  | 'featureHistoryRows'
  | 'scheduleVersion'
  | 'scheduleHistoryRows'
  | 'deletingHistoryVersion'
  | 'handleDeleteResourceHistoryEntry'
  | 'handleDeleteCostHistoryEntry'
  | 'handleDeleteFeatureHistoryEntry'
  | 'handleDeleteScheduleHistoryEntry'
>

export const ProjectInfoDialogAdvancedTab: FC<Props> = (props) => {
  const {
    t,
    isFeaturesInfo,
    isWorkspaceCatalog,
    draft,
    patchDraft,
  } = props
  return (
  <div className="tm-kb-settings-form">
    {isFeaturesInfo ? (
      <p className="tm-kb-settings-hint">{t('projectManagerPage.projectInfo.advancedHintFeatures')}</p>
    ) : null}
    {!isWorkspaceCatalog ? (
      <>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-region">
            {t('projectManagerPage.projectInfo.fieldRegion')}
          </label>
          <input
            id="pm-info-region"
            className="tm-kb-settings-input"
            value={draft.region}
            onChange={(event) => patchDraft({ region: event.target.value })}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-contract">
            {t('projectManagerPage.projectInfo.fieldContractValue')}
          </label>
          <input
            id="pm-info-contract"
            className="tm-kb-settings-input"
            value={draft.contractValue}
            onChange={(event) => patchDraft({ contractValue: event.target.value })}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-settled">
            {t('projectManagerPage.projectInfo.fieldSettledAmount')}
          </label>
          <input
            id="pm-info-settled"
            className="tm-kb-settings-input"
            value={draft.settledAmount}
            onChange={(event) => patchDraft({ settledAmount: event.target.value })}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-progress">
            {t('projectManagerPage.projectInfo.fieldProgressPercent')}
          </label>
          <input
            id="pm-info-progress"
            className="tm-kb-settings-input"
            value={draft.progressPercent}
            onChange={(event) => patchDraft({ progressPercent: event.target.value })}
          />
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label" htmlFor="pm-info-root">
            {t('projectManagerPage.projectInfo.fieldWorkspaceRoot')}
          </label>
          <input
            id="pm-info-root"
            className="tm-kb-settings-input"
            value={draft.workspaceRoot}
            onChange={(event) => patchDraft({ workspaceRoot: event.target.value })}
          />
        </div>
      </>
    ) : null}
    <ProjectInfoDialogAdvancedHistory {...props} />
  </div>
)}
