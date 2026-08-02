import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '@toolman/shared'
import { IconChevronRight, IconFile, IconFolder } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { buildStoragePathForKb } from '../knowledge/knowledge-import-paths'

type Props = {
  workspaceId: string
  knowledgeBases: KnowledgeBase[]
  defaultLocalFolderPath: string | null
  selectedKbId: string | null
  onClose: () => void
  onSelect: (kb: KnowledgeBase, path: string) => void
}

export function AssistantLibLocalKbPickerModal({
  workspaceId,
  knowledgeBases,
  defaultLocalFolderPath,
  selectedKbId,
  onClose,
  onSelect,
}: Props) {
  const { t } = useI18n()
  const localItems = useMemo(
    () => knowledgeBases.filter((kb) => kb.kind === 'local'),
    [knowledgeBases],
  )
  const [expandedId, setExpandedId] = useState<string | null>(selectedKbId)
  const [activeId, setActiveId] = useState<string | null>(selectedKbId)
  const [docsByKbId, setDocsByKbId] = useState<Record<string, KnowledgeDocument[]>>({})
  const [loadingKbId, setLoadingKbId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDocuments = useCallback(
    async (kbId: string) => {
      setLoadingKbId(kbId)
      setError(null)
      const result = await window.api.invoke(IpcChannel.KnowledgeDocumentList, {
        workspaceId,
        kbId,
      })
      setLoadingKbId(null)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const data = result.data as { items: KnowledgeDocument[] }
      setDocsByKbId((prev) => ({ ...prev, [kbId]: data.items }))
    },
    [workspaceId],
  )

  useEffect(() => {
    if (!expandedId) return
    if (docsByKbId[expandedId]) return
    void loadDocuments(expandedId)
  }, [docsByKbId, expandedId, loadDocuments])

  const resolveKbPath = (kb: KnowledgeBase) =>
    buildStoragePathForKb(defaultLocalFolderPath, kb.name) ?? kb.name

  const handleConfirm = () => {
    const kb = localItems.find((item) => item.id === activeId)
    if (!kb) {
      setError(t('assistantLibPage.selectKbRequired'))
      return
    }
    onSelect(kb, resolveKbPath(kb))
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal tm-agent-modal--create tm-alib-kb-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alib-local-kb-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="alib-local-kb-picker-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('assistantLibPage.pickLocalKbTitle')}
          </h3>
          <button
            type="button"
            className="tm-agent-modal-close"
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

        <div className="tm-agent-modal-body tm-agent-modal-body--single">
          <div className="tm-agent-modal-content">
            <div className="tm-alib-kb-picker-section-label">
              {t('assistantLibPage.textbookSourceKb')}
            </div>
            {localItems.length === 0 ? (
              <div className="tm-alib-kb-picker-empty">{t('assistantLibPage.pickLocalKbEmpty')}</div>
            ) : (
              <div className="tm-alib-kb-picker-list">
                {localItems.map((kb) => {
                  const isExpanded = expandedId === kb.id
                  const isActive = activeId === kb.id
                  const docs = docsByKbId[kb.id] ?? []
                  return (
                    <div key={kb.id} className="tm-alib-kb-picker-group">
                      <div
                        className={[
                          'tm-alib-kb-picker-row',
                          isActive ? 'tm-alib-kb-picker-row--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <button
                          type="button"
                          className="tm-alib-kb-picker-expand"
                          aria-label={isExpanded ? t('sidebar.agent.collapseHistory') : t('sidebar.agent.expandHistory')}
                          onClick={() =>
                            setExpandedId((current) => (current === kb.id ? null : kb.id))
                          }
                        >
                          <IconChevronRight size={14} open={isExpanded} />
                        </button>
                        <button
                          type="button"
                          className="tm-alib-kb-picker-kb"
                          onClick={() => setActiveId(kb.id)}
                          onDoubleClick={() => onSelect(kb, resolveKbPath(kb))}
                        >
                          <IconFolder size={14} />
                          <span className="tm-alib-kb-picker-name">{kb.name}</span>
                          <span className="tm-alib-kb-picker-meta">
                            {t('assistantLibPage.pickLocalKbDocCount', {
                              count: kb.documentCount,
                            })}
                          </span>
                        </button>
                      </div>
                      {isExpanded ? (
                        <div className="tm-alib-kb-picker-files">
                          {loadingKbId === kb.id ? (
                            <div className="tm-alib-kb-picker-empty">{t('common.loading')}</div>
                          ) : docs.length === 0 ? (
                            <div className="tm-alib-kb-picker-empty">
                              {t('assistantLibPage.pickLocalKbNoFiles')}
                            </div>
                          ) : (
                            docs.map((doc) => (
                              <button
                                key={doc.id}
                                type="button"
                                className={[
                                  'tm-alib-kb-picker-file',
                                  isActive ? 'tm-alib-kb-picker-file--active' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => setActiveId(kb.id)}
                                onDoubleClick={() => onSelect(kb, resolveKbPath(kb))}
                                title={doc.title}
                              >
                                <IconFile size={14} />
                                <span>{doc.title}</span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
            {error ? <p className="tm-agent-form-error">{error}</p> : null}
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            onClick={handleConfirm}
            disabled={!activeId}
          >
            {t('common.confirm')}
          </button>
        </footer>
      </div>
    </div>
  )
}
