import { useI18n } from '../../i18n/useI18n'
import { GroupResourcePickerModalList } from './GroupResourcePickerModalList'
import type { GroupResourcePickerModalProps } from './useGroupResourcePickerModal'
import { useGroupResourcePickerModal } from './useGroupResourcePickerModal'

export type { GroupResourcePickerModalProps } from './useGroupResourcePickerModal'

export function GroupResourcePickerModal({
  title,
  hint,
  confirmLabel,
  groups,
  loading = false,
  loadingGroupId = null,
  error: externalError = null,
  onClose,
  onConfirm,
  onGroupExpand,
}: GroupResourcePickerModalProps) {
  const { t } = useI18n()
  const picker = useGroupResourcePickerModal({
    title,
    hint,
    confirmLabel,
    groups,
    loading,
    loadingGroupId,
    error: externalError,
    onClose,
    onConfirm,
    onGroupExpand,
  })

  const {
    resolvedConfirmLabel,
    selectableGroups,
    busy,
    combinedError,
    selectionCount,
    expandedIds,
    selectedKeys,
    getSelectableItems,
    isGroupFullySelected,
    isGroupPartiallySelected,
    toggleGroup,
    toggleItem,
    toggleExpanded,
    handleConfirm,
  } = picker

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--knowledge-create tm-modal--resource-picker"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">{title}</h2>
          <button
            type="button"
            className="tm-modal-close"
            onClick={onClose}
            aria-label={t('groupPage.picker.close')}
          >
            ×
          </button>
        </header>
        <div className="tm-modal-body">
          <p className="tm-form-hint">{hint}</p>
          {loading && groups.length === 0 ? (
            <p className="tm-kb-file-panel-empty">{t('groupPage.picker.loading')}</p>
          ) : selectableGroups.length === 0 ? (
            <p className="tm-kb-file-panel-empty">{t('groupPage.picker.empty')}</p>
          ) : (
            <GroupResourcePickerModalList
              t={t}
              groups={groups}
              loadingGroupId={loadingGroupId}
              expandedIds={expandedIds}
              selectedKeys={selectedKeys}
              getSelectableItems={getSelectableItems}
              isGroupFullySelected={isGroupFullySelected}
              isGroupPartiallySelected={isGroupPartiallySelected}
              toggleGroup={toggleGroup}
              toggleItem={toggleItem}
              toggleExpanded={toggleExpanded}
            />
          )}
          {combinedError ? <p className="tm-form-error">{combinedError}</p> : null}
        </div>
        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose}>
            {t('groupPage.picker.cancel')}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={busy || selectionCount === 0}
            onClick={() => void handleConfirm()}
          >
            {busy
              ? t('groupPage.picker.adding')
              : `${resolvedConfirmLabel}${selectionCount > 0 ? ` (${selectionCount})` : ''}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
