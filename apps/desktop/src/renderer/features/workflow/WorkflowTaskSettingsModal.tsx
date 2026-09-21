import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useWorkflows } from './useWorkflows'

interface Props {
  open: boolean
  onClose: () => void
}

export function WorkflowTaskSettingsModal({ open, onClose }: Props) {
  const { t } = useI18n()
  const { activeTask, updateTask } = useWorkflows()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !activeTask) return
    setName(activeTask.name)
    setDescription(activeTask.description ?? '')
  }, [open, activeTask])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleSave = async () => {
    if (!activeTask) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await updateTask(activeTask.id, {
        name,
        description,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-task-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="workflow-task-settings-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('workflowPage.taskSettingsTitle')}
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
            {activeTask ? (
              <div className="tm-agent-settings-form">
                <div className="tm-agent-setting-row">
                  <label className="tm-agent-setting-label" htmlFor="workflow-task-name">
                    {t('workflowPage.taskName')}
                  </label>
                  <input
                    id="workflow-task-name"
                    className="tm-agent-setting-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoFocus
                  />
                </div>
                <div className="tm-agent-setting-row tm-agent-setting-row--top">
                  <label className="tm-agent-setting-label" htmlFor="workflow-task-description">
                    {t('workflowPage.taskDescription')}
                  </label>
                  <textarea
                    id="workflow-task-description"
                    className="tm-agent-setting-textarea"
                    rows={6}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>
            ) : (
              <p className="tm-kb-settings-hint">{t('workflowPage.taskSettingsEmpty')}</p>
            )}
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            disabled={saving || !activeTask}
            onClick={() => void handleSave()}
          >
            {t('common.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}
