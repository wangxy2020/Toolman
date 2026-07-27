import type { FC } from 'react'

import { formatWorkItemDate } from './pm-gantt-utils'
import { formatDateTime } from './pm-project-info-dialog-utils'
import { ProjectInfoDialogSaveHistoryTable } from './ProjectInfoDialogSaveHistoryTable'
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

export const ProjectInfoDialogAdvancedTab: FC<Props> = ({
  t,
  isFeaturesInfo,
  isWorkspaceCatalog,
  draft,
  patchDraft,
  isResourceInfo,
  isCreate,
  isWorkspaceResource,
  isCostInfo,
  isWorkspaceCost,
  isWorkspaceFeatures,
  project,
  lastSavedAt,
  dateInputLang,
  resourceVersion,
  resourceHistoryRows,
  costVersion,
  costHistoryRows,
  featureVersion,
  featureHistoryRows,
  scheduleVersion,
  scheduleHistoryRows,
  deletingHistoryVersion,
  handleDeleteResourceHistoryEntry,
  handleDeleteCostHistoryEntry,
  handleDeleteFeatureHistoryEntry,
  handleDeleteScheduleHistoryEntry,
}) => (
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
    {isResourceInfo && (!isCreate || isWorkspaceResource) ? (
      <>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldUpdatedAt')}</label>
          <span className="tm-kb-settings-readonly">
            {lastSavedAt != null ? formatDateTime(lastSavedAt, dateInputLang) : '—'}
          </span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldResourceVersion')}
          </label>
          <span className="tm-kb-settings-readonly">
            {resourceVersion > 0
              ? t('projectManagerPage.projectInfo.saveHistoryVersion', { version: String(resourceVersion) })
              : t('projectManagerPage.projectInfo.resourceVersionNever')}
          </span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
          </label>
          <span className="tm-kb-settings-readonly">
            {lastSavedAt != null ? formatDateTime(lastSavedAt, dateInputLang) : '—'}
          </span>
        </div>
        <div className="tm-kb-settings-row tm-kb-settings-row--top">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldSaveHistory')}</label>
          <ProjectInfoDialogSaveHistoryTable
            t={t}
            dateInputLang={dateInputLang}
            rows={resourceHistoryRows}
            currentVersion={resourceVersion}
            deletingVersion={deletingHistoryVersion}
            onDelete={handleDeleteResourceHistoryEntry}
            variant="resource"
            columns={[
              {
                header: t('projectManagerPage.projectInfo.saveHistoryColResources'),
                render: (entry) =>
                  t('projectManagerPage.projectInfo.saveHistoryResources', {
                    count: String(entry.resourceCount),
                  }),
              },
            ]}
          />
        </div>
      </>
    ) : null}
    {isCostInfo && (!isCreate || isWorkspaceCost) ? (
      <>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldUpdatedAt')}</label>
          <span className="tm-kb-settings-readonly">
            {lastSavedAt != null ? formatDateTime(lastSavedAt, dateInputLang) : '—'}
          </span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldCostVersion')}
          </label>
          <span className="tm-kb-settings-readonly">
            {costVersion > 0
              ? t('projectManagerPage.projectInfo.saveHistoryVersion', { version: String(costVersion) })
              : t('projectManagerPage.projectInfo.costVersionNever')}
          </span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
          </label>
          <span className="tm-kb-settings-readonly">
            {lastSavedAt != null ? formatDateTime(lastSavedAt, dateInputLang) : '—'}
          </span>
        </div>
        <div className="tm-kb-settings-row tm-kb-settings-row--top">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldSaveHistory')}</label>
          <ProjectInfoDialogSaveHistoryTable
            t={t}
            dateInputLang={dateInputLang}
            rows={costHistoryRows}
            currentVersion={costVersion}
            deletingVersion={deletingHistoryVersion}
            onDelete={handleDeleteCostHistoryEntry}
            variant="resource"
            columns={[
              {
                header: t('projectManagerPage.projectInfo.saveHistoryColCosts'),
                render: (entry) =>
                  t('projectManagerPage.projectInfo.saveHistoryCosts', { count: String(entry.costCount) }),
              },
            ]}
          />
        </div>
      </>
    ) : null}
    {isFeaturesInfo && (!isCreate || isWorkspaceFeatures) ? (
      <>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldFeatureVersion')}
          </label>
          <span className="tm-kb-settings-readonly">
            {featureVersion > 0
              ? t('projectManagerPage.projectInfo.saveHistoryVersion', { version: String(featureVersion) })
              : t('projectManagerPage.projectInfo.featureVersionNever')}
          </span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
          </label>
          <span className="tm-kb-settings-readonly">
            {lastSavedAt != null ? formatDateTime(lastSavedAt, dateInputLang) : '—'}
          </span>
        </div>
        <div className="tm-kb-settings-row tm-kb-settings-row--top">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldSaveHistory')}</label>
          <ProjectInfoDialogSaveHistoryTable
            t={t}
            dateInputLang={dateInputLang}
            rows={featureHistoryRows}
            currentVersion={featureVersion}
            deletingVersion={deletingHistoryVersion}
            onDelete={handleDeleteFeatureHistoryEntry}
            variant="resource"
            columns={[
              {
                header: t('projectManagerPage.projectInfo.saveHistoryColFeatures'),
                render: (entry) =>
                  t('projectManagerPage.projectInfo.saveHistoryFeatures', {
                    count: String(entry.featureCount),
                  }),
              },
            ]}
          />
        </div>
      </>
    ) : null}
    {!isResourceInfo && !isCostInfo && !isFeaturesInfo && !isCreate && project ? (
      <>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldUpdatedAt')}</label>
          <span className="tm-kb-settings-readonly">{formatWorkItemDate(project.updatedAt)}</span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldScheduleVersion')}
          </label>
          <span className="tm-kb-settings-readonly">
            {scheduleVersion > 0
              ? t('projectManagerPage.projectInfo.saveHistoryVersion', { version: String(scheduleVersion) })
              : t('projectManagerPage.projectInfo.scheduleVersionNever')}
          </span>
        </div>
        <div className="tm-kb-settings-row">
          <label className="tm-kb-settings-label">
            {t('projectManagerPage.projectInfo.fieldLastSavedAt')}
          </label>
          <span className="tm-kb-settings-readonly">
            {lastSavedAt != null ? formatDateTime(lastSavedAt, dateInputLang) : '—'}
          </span>
        </div>
        <div className="tm-kb-settings-row tm-kb-settings-row--top">
          <label className="tm-kb-settings-label">{t('projectManagerPage.projectInfo.fieldSaveHistory')}</label>
          <ProjectInfoDialogSaveHistoryTable
            t={t}
            dateInputLang={dateInputLang}
            rows={scheduleHistoryRows}
            currentVersion={scheduleVersion}
            deletingVersion={deletingHistoryVersion}
            onDelete={handleDeleteScheduleHistoryEntry}
            variant="schedule"
            columns={[
              {
                header: t('projectManagerPage.projectInfo.saveHistoryColDuration'),
                render: (entry) =>
                  entry.totalDurationDays != null
                    ? t('projectManagerPage.projectInfo.saveHistoryDuration', {
                        days: String(entry.totalDurationDays),
                      })
                    : '—',
              },
              {
                header: t('projectManagerPage.projectInfo.saveHistoryColTasks'),
                render: (entry) =>
                  t('projectManagerPage.projectInfo.saveHistoryTasks', {
                    count: String(entry.workItemCount),
                  }),
              },
            ]}
          />
        </div>
      </>
    ) : null}
  </div>
)
