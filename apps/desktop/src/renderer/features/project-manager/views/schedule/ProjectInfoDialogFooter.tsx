import type { FC } from 'react'

import type { Props as DialogProps } from './pm-project-info-dialog-utils'
import type { ProjectInfoDialogState } from './useProjectInfoDialog'

type Props = Pick<
  ProjectInfoDialogState,
  | 't'
  | 'onClose'
  | 'saving'
  | 'isWorkspaceResource'
  | 'isResourceInfo'
  | 'isCreate'
  | 'isCostInfo'
  | 'isFeaturesInfo'
  | 'handleSave'
> & {
  props: DialogProps
}

export const ProjectInfoDialogFooter: FC<Props> = ({
  t,
  onClose,
  saving,
  isWorkspaceResource,
  isResourceInfo,
  isCreate,
  isCostInfo,
  isFeaturesInfo,
  handleSave,
  props,
}) => (
  <footer className="tm-kb-settings-modal-footer">
    <div className="tm-kb-settings-modal-footer-actions">
      <button
        type="button"
        className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
        onClick={onClose}
        disabled={saving}>
        {t('projectManagerPage.database.cancel')}
      </button>
      {isWorkspaceResource ||
      (isResourceInfo && !isCreate && 'onSaveResources' in props && props.onSaveResources) ? (
        <button
          type="button"
          className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
          onClick={() => void handleSave()}
          disabled={
            saving ||
            !(props.mode === 'workspaceResource'
              ? props.onSaveResources
              : 'onSaveResources' in props && props.onSaveResources)
          }>
          {saving ? t('projectManagerPage.projectInfo.saving') : t('projectManagerPage.projectInfo.saveCatalog')}
        </button>
      ) : isCostInfo &&
        ((props.mode === 'workspaceCost' && props.onSaveCosts) ||
          (props.mode !== 'workspaceCost' &&
            props.mode !== 'create' &&
            'onSaveCosts' in props &&
            props.onSaveCosts)) ? (
        <button
          type="button"
          className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
          onClick={() => void handleSave()}
          disabled={saving}>
          {saving ? t('projectManagerPage.projectInfo.saving') : t('projectManagerPage.projectInfo.saveCatalog')}
        </button>
      ) : isFeaturesInfo &&
        ((props.mode === 'workspaceFeatures' && props.onSaveFeatures) ||
          (props.mode !== 'workspaceFeatures' &&
            props.mode !== 'create' &&
            'onSaveFeatures' in props &&
            props.onSaveFeatures)) ? (
        <button
          type="button"
          className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
          onClick={() => void handleSave()}
          disabled={saving}>
          {saving ? t('projectManagerPage.projectInfo.saving') : t('projectManagerPage.projectInfo.saveCatalog')}
        </button>
      ) : (
        <>
          {isCreate ? (
            <button
              type="button"
              className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--secondary"
              onClick={() => void handleSave({ manualCreate: true })}
              disabled={saving}>
              {saving
                ? t('projectManagerPage.projectInfo.saving')
                : t('projectManagerPage.projectInfo.manualCreate')}
            </button>
          ) : null}
          <button
            type="button"
            className="tm-kb-settings-modal-footer-btn tm-kb-settings-modal-footer-btn--primary"
            onClick={() => void handleSave()}
            disabled={saving}>
            {saving
              ? t('projectManagerPage.projectInfo.saving')
              : isCreate
                ? t('projectManagerPage.projectInfo.confirmCreate')
                : t('projectManagerPage.database.save')}
          </button>
        </>
      )}
    </div>
  </footer>
)
