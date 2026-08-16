import type { useAssistantLibSettingsDialog } from './hooks/useAssistantLibSettingsDialog'

type DialogState = ReturnType<typeof useAssistantLibSettingsDialog>

export function AssistantLibSettingsDangerTab({
  state,
}: {
  state: Pick<
    DialogState,
    't' | 'isDefaultClassroom' | 'busy' | 'setConfirmDelete'
  > & { onDeleteSession?: (sessionId: string) => void | Promise<void> }
}) {
  const { t, isDefaultClassroom, busy, setConfirmDelete, onDeleteSession } = state
  return (
    <div className="tm-kb-settings-form tm-alib-settings-danger">
      <span className="tm-group-settings-section-title">
        {t('assistantLibPage.settingsDangerSection')}
      </span>
      <div className="tm-group-settings-danger-card">
        {isDefaultClassroom ? (
          <p className="tm-group-settings-hint">
            {t('assistantLibPage.settingsDeleteDefaultBlocked')}
          </p>
        ) : (
          <>
            <p className="tm-group-settings-hint">
              {t('assistantLibPage.settingsDeleteCourseHint')}
            </p>
            <button
              type="button"
              className="tm-group-settings-danger-btn"
              disabled={busy || !onDeleteSession}
              onClick={() => setConfirmDelete(true)}
            >
              {t('assistantLibPage.settingsDeleteCourseBtn')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
