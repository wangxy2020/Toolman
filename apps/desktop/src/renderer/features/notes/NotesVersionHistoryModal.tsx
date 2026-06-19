import { formatVersionLabel } from './notes-versions'
import type { NoteItem } from './notes-storage'

interface Props {
  note: NoteItem
  onRestore: (versionId: string) => void
  onClose: () => void
}

export function NotesVersionHistoryModal({ note, onRestore, onClose }: Props) {
  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-confirm-dialog tm-notes-version-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="tm-confirm-dialog-title">版本历史</h2>
        <p className="tm-confirm-dialog-message">共 {note.versions.length} 个自动保存版本</p>
        <div className="tm-notes-version-list">
          {note.versions.length === 0 ? (
            <p className="tm-notes-version-empty">暂无历史版本，编辑后会自动保存。</p>
          ) : (
            note.versions.map((version) => (
              <div key={version.id} className="tm-notes-version-item">
                <div>
                  <div className="tm-notes-version-item-title">{version.title || '无标题'}</div>
                  <div className="tm-notes-version-item-time">{formatVersionLabel(version)}</div>
                </div>
                <button
                  type="button"
                  className="tm-btn tm-btn--ghost"
                  onClick={() => {
                    onRestore(version.id)
                    onClose()
                  }}
                >
                  恢复
                </button>
              </div>
            ))
          )}
        </div>
        <div className="tm-confirm-dialog-actions">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
