import { useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceId: string
  onChanged?: () => void
}

export function KnowledgeSourcesPanel({ workspaceId, onChanged }: Props) {
  const { t } = useI18n()
  const [rebuildingFts, setRebuildingFts] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ftsMessage, setFtsMessage] = useState<string | null>(null)

  const handleFtsRebuild = async () => {
    if (!window.confirm(t('knowledgePage.sources.rebuildConfirm'))) {
      return
    }

    setRebuildingFts(true)
    setError(null)
    setFtsMessage(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeFtsRebuild, { workspaceId })
    setRebuildingFts(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { indexed: number }
    setFtsMessage(t('knowledgePage.sources.rebuilt', { count: data.indexed }))
    onChanged?.()
  }

  return (
    <section className="tm-knowledge-settings-section">
      <h3 className="tm-knowledge-settings-heading">{t('knowledgePage.sources.title')}</h3>
      <p className="tm-knowledge-detail-hint">{t('knowledgePage.sources.hint')}</p>
      <button
        type="button"
        className="tm-btn tm-btn--secondary"
        disabled={rebuildingFts}
        onClick={() => void handleFtsRebuild()}
      >
        {rebuildingFts ? t('knowledgePage.sources.rebuilding') : t('knowledgePage.sources.rebuild')}
      </button>
      {error ? <p className="tm-form-error">{error}</p> : null}
      {ftsMessage ? <p className="tm-knowledge-detail-hint">{ftsMessage}</p> : null}
    </section>
  )
}
