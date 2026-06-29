import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupSettingsDangerTab } from './GroupSettingsDangerTab'
import { GroupSettingsGeneralTab } from './GroupSettingsGeneralTab'
import { GroupSettingsStorageTab } from './GroupSettingsStorageTab'
import type { GroupSettingsModalProps } from './group-settings-modal-types'
import { useGroupSettingsModal } from './useGroupSettingsModal'

export type {
  GroupSettingsModalProps,
  GroupSettingsSyncStatusProps,
} from './group-settings-modal-types'

export function GroupSettingsModal(props: GroupSettingsModalProps) {
  const modal = useGroupSettingsModal(props)
  const {
    t,
    workspaceName,
    workspace,
    isOwner,
    activeTab,
    setActiveTab,
    error,
    saving,
    isDirty,
    handleSave,
    confirmAction,
    setConfirmAction,
    handleLeave,
    handleDissolve,
    tabs,
    onClose,
    name,
    setName,
    description,
    setDescription,
    syncStatus,
    storagePath,
    storageLoading,
    openStoragePath,
    displayLastEventSeq,
    sequencingLabel,
    replicationLabel,
    meshDetail,
    actionBusy,
  } = modal

  return (
    <div className="tm-modal-overlay tm-modal-overlay--group-settings" onClick={onClose}>
      <div
        className="tm-group-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-group-settings-modal-header">
          <div className="tm-group-settings-modal-heading">
            <h3 id="group-settings-title" className="tm-group-settings-modal-title">
              <span className="tm-group-settings-modal-title-dot" aria-hidden="true" />
              {t('groupPage.settingsTitle')}
            </h3>
            <p className="tm-group-settings-modal-subtitle">
              {workspaceName} · {t('groupPage.settings.memberCount', { count: workspace.memberCount })}
            </p>
          </div>
          <button
            type="button"
            className="tm-group-settings-modal-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-group-settings-modal-body">
          <nav className="tm-group-settings-modal-nav" aria-label={t('groupPage.settingsNavAria')}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-group-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-group-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tm-group-settings-modal-content">
            {error ? <div className="tm-group-settings-error">{error}</div> : null}

            {activeTab === 'general' ? (
              <GroupSettingsGeneralTab
                t={t}
                name={name}
                setName={setName}
                description={description}
                setDescription={setDescription}
                isOwner={isOwner}
              />
            ) : null}

            {activeTab === 'storage' ? (
              <GroupSettingsStorageTab
                t={t}
                syncStatus={syncStatus}
                storagePath={storagePath}
                storageLoading={storageLoading}
                openStoragePath={openStoragePath}
                displayLastEventSeq={displayLastEventSeq}
                sequencingLabel={sequencingLabel}
                replicationLabel={replicationLabel}
                meshDetail={meshDetail}
              />
            ) : null}

            {activeTab === 'danger' ? (
              <GroupSettingsDangerTab
                t={t}
                isOwner={isOwner}
                actionBusy={actionBusy}
                setConfirmAction={setConfirmAction}
              />
            ) : null}
          </div>
        </div>

        <footer className="tm-group-settings-modal-footer">
          <div className="tm-group-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              {isOwner ? t('common.cancel') : t('common.close')}
            </button>
            {isOwner ? (
              <button
                type="button"
                className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--primary"
                disabled={!isDirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? t('common.loading') : t('knowledgePage.settings.saveConfig')}
              </button>
            ) : null}
          </div>
        </footer>
      </div>

      {confirmAction === 'leave' ? (
        <ConfirmDialog
          title={t('groupPage.settings.leaveTitle')}
          message={t('groupPage.settings.leaveConfirm', { name: workspaceName })}
          confirmLabel={t('groupPage.settings.leaveTitle')}
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleLeave()}
        />
      ) : null}

      {confirmAction === 'dissolve' ? (
        <ConfirmDialog
          title={t('groupPage.settings.dissolveTitle')}
          message={t('groupPage.settings.dissolveConfirm', { name: workspaceName })}
          confirmLabel={t('groupPage.settings.dissolveTitle')}
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleDissolve()}
        />
      ) : null}
    </div>
  )
}
