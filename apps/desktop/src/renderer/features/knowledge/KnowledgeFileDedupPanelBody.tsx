import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconExternalLink, IconFile, IconFolder, IconTrash } from '../../components/icons'
import { computeProgressPercent, formatBytes, formatEta, formatStatSize } from './knowledge-dedup-utils'
import { openDedupParentFolder, openDedupPath } from './knowledge-dedup-operations'
import type { KnowledgeFileDedupPanelState } from './useKnowledgeFileDedupPanel'

export function KnowledgeFileDedupPanelBody(state: KnowledgeFileDedupPanelState) {
  const {
    t,
    stats,
    loading,
    selectedPaths,
    selectMode,
    progress,
    cancelling,
    pendingDelete,
    setPendingDelete,
    rows,
    duplicateGroupCount,
    handleCancelScan,
    applySelectMode,
    handleSelectAll,
    handleClearSelection,
    togglePath,
    handleDeleteSelected,
    handleDeleteSingle,
    confirmPendingDelete,
  } = state

  const progressPercent = computeProgressPercent(progress)

  return (
    <>
      {loading ? (
        <div className="tm-dedup-loading">
          <p className="tm-dedup-loading-title">
            {progress?.phase === 'listing'
              ? t('knowledgePage.dedup.phaseListing')
              : t('knowledgePage.dedup.phaseHashing')}
          </p>
          <p className="tm-dedup-loading-meta">
            {progress?.phase === 'hashing' && progress.total > 0
              ? t('knowledgePage.dedup.progressHashing', {
                  scanned: progress.scanned,
                  total: progress.total,
                  percent: progressPercent,
                })
              : progress && progress.scanned > 0
                ? t('knowledgePage.dedup.progressListed', { scanned: progress.scanned })
                : t('knowledgePage.dedup.preparing')}
          </p>
          <p className="tm-dedup-loading-meta">
            {t('knowledgePage.dedup.etaRemaining', {
              eta: formatEta(progress?.etaSeconds ?? null, t),
            })}
          </p>
          <div className="tm-dedup-progress">
            <div
              className="tm-dedup-progress-bar"
              style={{
                width: `${Math.max(progressPercent, progress && progress.scanned > 0 ? 4 : 0)}%`,
              }}
            />
          </div>
          <button
            type="button"
            className="tm-btn tm-btn--ghost tm-dedup-cancel-btn"
            disabled={cancelling}
            onClick={() => void handleCancelScan()}
          >
            {cancelling ? t('knowledgePage.dedup.cancelling') : t('knowledgePage.dedup.cancelScan')}
          </button>
        </div>
      ) : null}

      {stats && !loading ? (
        <div className="tm-dedup-stats">
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsTotalFiles')}</span>
            <strong className="tm-dedup-stat-value">{stats.scannedCount}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsTotalSize')}</span>
            <strong className="tm-dedup-stat-value">{formatStatSize(stats.totalSizeBytes)}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsDuplicateGroups')}</span>
            <strong className="tm-dedup-stat-value">{duplicateGroupCount}</strong>
          </div>
          <div className="tm-dedup-stat-card">
            <span className="tm-dedup-stat-label">{t('knowledgePage.dedup.statsSavable')}</span>
            <strong className="tm-dedup-stat-value">{formatStatSize(stats.savableBytes)}</strong>
          </div>
        </div>
      ) : null}

      {!loading && stats && rows.length === 0 ? (
        <div className="tm-dedup-empty tm-dedup-empty--inline">
          <p className="tm-dedup-empty-title">{t('knowledgePage.dedup.noDuplicatesTitle')}</p>
          <p className="tm-dedup-empty-hint">{t('knowledgePage.dedup.noDuplicatesHint')}</p>
        </div>
      ) : null}

      {rows.length > 0 && !loading ? (
        <>
          <div className="tm-dedup-toolbar">
            <h3 className="tm-dedup-toolbar-title">
              {t('knowledgePage.dedup.duplicateTitle', { count: duplicateGroupCount })}
            </h3>
            <div className="tm-dedup-toolbar-actions">
              {(
                [
                  ['all', t('knowledgePage.dedup.modeAll')],
                  ['largest', t('knowledgePage.dedup.modeLargest')],
                  ['oldest', t('knowledgePage.dedup.modeOldest')],
                  ['smart', t('knowledgePage.dedup.modeSmart')],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`tm-dedup-filter-btn${selectMode === mode ? ' tm-dedup-filter-btn--active' : ''}`}
                  onClick={() => applySelectMode(mode)}
                >
                  {label}
                </button>
              ))}
              <span className="tm-dedup-toolbar-sep" />
              <button type="button" className="tm-dedup-filter-btn" onClick={handleSelectAll}>
                {t('knowledgePage.dedup.selectAll')}
              </button>
              <button type="button" className="tm-dedup-filter-btn" onClick={handleClearSelection}>
                {t('knowledgePage.dedup.clearSelection')}
              </button>
              <button
                type="button"
                className="tm-dedup-delete-btn"
                disabled={loading || selectedPaths.size === 0}
                onClick={handleDeleteSelected}
              >
                {selectedPaths.size > 0
                  ? t('knowledgePage.dedup.deleteCount', { count: selectedPaths.size })
                  : t('knowledgePage.dedup.delete')}
              </button>
            </div>
          </div>

          <div className="tm-dedup-table-wrap">
            <table className="tm-dedup-table">
              <thead>
                <tr>
                  <th className="tm-dedup-col-check" />
                  <th>{t('knowledgePage.dedup.colFileName')}</th>
                  <th className="tm-dedup-col-type">{t('knowledgePage.dedup.colFileType')}</th>
                  <th className="tm-dedup-col-size">{t('knowledgePage.dedup.colSize')}</th>
                  <th className="tm-dedup-col-actions">{t('knowledgePage.dedup.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.path}
                    className={selectedPaths.has(row.path) ? 'tm-dedup-row--selected' : ''}
                  >
                    <td className="tm-dedup-col-check">
                      <input
                        type="checkbox"
                        checked={selectedPaths.has(row.path)}
                        onChange={() => togglePath(row.path)}
                      />
                    </td>
                    <td>
                      <div className="tm-dedup-file-cell">
                        <IconFile size={16} />
                        <span className="tm-dedup-file-name" title={row.path}>
                          {row.fileName}
                          {row.isFirstInGroup ? (
                            <span className="tm-dedup-file-badge">{t('knowledgePage.dedup.keepBadge')}</span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="tm-dedup-col-type">{row.extension}</td>
                    <td className="tm-dedup-col-size">{formatBytes(row.sizeBytes)}</td>
                    <td className="tm-dedup-col-actions">
                      <div className="tm-dedup-row-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn"
                          title={t('knowledgePage.dedup.openFile')}
                          onClick={() => void openDedupPath(row.path)}
                        >
                          <IconExternalLink size={15} />
                        </button>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn"
                          title={t('knowledgePage.dedup.openFolder')}
                          onClick={() => void openDedupParentFolder(row.path)}
                        >
                          <IconFolder size={15} />
                        </button>
                        <button
                          type="button"
                          className="tm-dedup-icon-btn tm-dedup-icon-btn--danger"
                          title={t('knowledgePage.dedup.deleteFile')}
                          disabled={loading}
                          onClick={() => handleDeleteSingle(row.path)}
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={t('knowledgePage.deleteFile')}
          message={pendingDelete.message}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmPendingDelete()}
        />
      ) : null}
    </>
  )
}
