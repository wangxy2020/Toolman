import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
} from './SettingsShared'
import { IconFolderOpen, IconSave } from './data-settings-icons'
import { formatBytes, truncatePath } from './data-settings-utils'
import { useDataSettingsPanel } from './useDataSettingsPanel'

export function DataSettingsPanel() {
  const { t } = useI18n()
  const {
    stats,
    statsLoading,
    busy,
    error,
    message,
    pendingConfirm,
    setPendingConfirm,
    openPath,
    handleBackup,
    handlePickRestore,
    handleConfirm,
  } = useDataSettingsPanel()

  const confirmDialog = pendingConfirm
    ? {
        deleteKnowledge: {
          title: t('settings.data.confirm.deleteKnowledge.title'),
          message: t('settings.data.confirm.deleteKnowledge.message'),
          confirmLabel: t('settings.data.confirm.deleteKnowledge.confirmLabel'),
          danger: true,
        },
        clearCache: {
          title: t('settings.data.confirm.clearCache.title'),
          message: t('settings.data.confirm.clearCache.message'),
          confirmLabel: t('settings.data.confirm.clearCache.confirmLabel'),
          danger: false,
        },
        resetData: {
          title: t('settings.data.confirm.resetData.title'),
          message: t('settings.data.confirm.resetData.message'),
          confirmLabel: t('settings.data.confirm.resetData.confirmLabel'),
          danger: true,
        },
        restore: {
          title: t('settings.data.confirm.restore.title'),
          message: t('settings.data.confirm.restore.message'),
          confirmLabel: t('settings.data.confirm.restore.confirmLabel'),
          danger: true,
        },
      }[pendingConfirm.kind]
    : null

  return (
    <SettingsPageLayout>
      <div className="tm-data-settings">
        <SettingsSection title={t('settings.data.title')}>
          <SettingsRow
            label={t('settings.data.backupRestore')}
            hint={message ?? error ?? undefined}
          >
            <div className="tm-data-actions">
              <button
                type="button"
                className="tm-data-btn"
                disabled={busy}
                onClick={() => void handleBackup(t)}
              >
                <IconSave />
                {t('settings.data.fullBackup')}
              </button>
              <button
                type="button"
                className="tm-data-btn"
                disabled={busy}
                onClick={() => void handlePickRestore()}
              >
                <IconFolderOpen />
                {t('settings.data.restore')}
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.data.directories.title')}>
          <SettingsRow
            label={t('settings.data.directories.userWork')}
            hint={t('settings.data.directories.userWorkHint')}
          >
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.userWorkDirectory}>
                {statsLoading
                  ? t('settings.data.loading')
                  : stats?.userWorkDirectory
                    ? truncatePath(stats.userWorkDirectory)
                    : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats?.userWorkDirectory}
                onClick={() => stats?.userWorkDirectory && void openPath(stats.userWorkDirectory)}
              >
                {t('settings.data.openDir')}
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.data.directories.appData')}>
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.userData}>
                {statsLoading ? t('settings.data.loading') : stats ? truncatePath(stats.userData) : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats}
                onClick={() => stats && void openPath(stats.userData)}
              >
                {t('settings.data.openDir')}
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.data.directories.appLogs')}>
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.logs}>
                {statsLoading ? t('settings.data.loading') : stats ? truncatePath(stats.logs) : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats}
                onClick={() => stats && void openPath(stats.logs)}
              >
                {t('settings.data.openLogs')}
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.data.directories.knowledgeFiles')}>
            <button
              type="button"
              className="tm-data-btn"
              disabled={busy || !stats}
              onClick={() => setPendingConfirm({ kind: 'deleteKnowledge' })}
            >
              {t('settings.data.deleteFiles')}
            </button>
          </SettingsRow>

          <SettingsRow
            label={
              stats
                ? t('settings.data.clearCacheWithSize', { size: formatBytes(stats.cacheBytes) })
                : t('settings.data.clearCache')
            }
          >
            <button
              type="button"
              className="tm-data-btn"
              disabled={busy}
              onClick={() => setPendingConfirm({ kind: 'clearCache' })}
            >
              {t('settings.data.clearCache')}
            </button>
          </SettingsRow>

          <SettingsRow label={t('settings.data.resetData')}>
            <button
              type="button"
              className="tm-data-btn tm-data-btn--danger"
              disabled={busy}
              onClick={() => setPendingConfirm({ kind: 'resetData' })}
            >
              {t('settings.data.resetData')}
            </button>
          </SettingsRow>
        </SettingsSection>
      </div>

      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={t('common.cancel')}
          danger={confirmDialog.danger}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => handleConfirm(t)}
        />
      ) : null}
    </SettingsPageLayout>
  )
}
