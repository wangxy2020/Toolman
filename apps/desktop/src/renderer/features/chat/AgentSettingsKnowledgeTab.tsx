import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type KnowledgeBase } from '@toolman/shared'
import { SYSTEM_DEFAULT_FOLDER_KB_NAMES } from '../knowledge/knowledge-sidebar-types'
import { useI18n } from '../../i18n/useI18n'

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

type KbSetting = {
  topK?: number
  scoreThreshold?: number
}

interface Props {
  workspaceId: string
  kbIds: string[]
  kbTopK?: number
  kbScoreThreshold?: number
  kbSettings?: Record<string, KbSetting>
  onKbToggle: (kbId: string, enabled: boolean) => void
  onKbTopKChange: (value?: number) => void
  onKbScoreThresholdChange: (value?: number) => void
  onKbSettingChange: (kbId: string, patch: KbSetting) => void
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function AgentSettingsKnowledgeTab({
  workspaceId,
  kbIds,
  kbTopK,
  kbScoreThreshold,
  kbSettings,
  onKbToggle,
  onKbTopKChange,
  onKbScoreThresholdChange,
  onKbSettingChange,
}: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.KnowledgeBaseList, { workspaceId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { items: KnowledgeBase[] }
    setItems(
      data.items.filter(
        (kb) => !SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name) && kb.kind !== 'local_files',
      ),
    )
    setError(null)
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="tm-agent-tab-panel">
      {error ? <div className="tm-settings-error">{error}</div> : null}

      <div className="tm-agent-tab-head">
        <h3 className="tm-agent-tab-title">{t('agent.knowledge.bindTitle')}</h3>
      </div>

      <p className="tm-knowledge-detail-hint">
        {t('agent.knowledge.bindHint')}
      </p>

      <div className="tm-agent-kb-global-settings">
        <label className="tm-form-field">
          <span className="tm-form-label">{t('agent.knowledge.defaultTopK')}</span>
          <input
            className="tm-form-input"
            type="number"
            min={1}
            max={20}
            value={kbTopK ?? ''}
            placeholder={t('agent.knowledge.placeholderTopK')}
            onChange={(event) => onKbTopKChange(parseOptionalNumber(event.target.value))}
          />
        </label>
        <label className="tm-form-field">
          <span className="tm-form-label">{t('agent.knowledge.defaultThreshold')}</span>
          <input
            className="tm-form-input"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={kbScoreThreshold ?? ''}
            placeholder={t('agent.knowledge.placeholderThreshold')}
            onChange={(event) => onKbScoreThresholdChange(parseOptionalNumber(event.target.value))}
          />
        </label>
      </div>

      {loading ? <div className="tm-settings-loading">{t('agent.knowledge.loading')}</div> : null}

      {!loading && items.length === 0 ? (
        <p className="tm-knowledge-detail-hint">{t('agent.knowledge.empty')}</p>
      ) : null}

      <div className="tm-skill-list">
        {items.map((kb) => {
          const enabled = kbIds.includes(kb.id)
          const perKb = kbSettings?.[kb.id]
          const expanded = expandedKbId === kb.id

          return (
            <div key={kb.id} className="tm-skill-card tm-skill-card--stacked">
              <div className="tm-skill-card-row">
                <div className="tm-skill-card-main">
                  <div className="tm-skill-card-name">{kb.name}</div>
                  {kb.description ? (
                    <div className="tm-skill-card-desc">{kb.description}</div>
                  ) : null}
                  <div className="tm-skill-card-meta">
                    <span className={`tm-tool-tag ${enabled ? 'tm-tool-tag--on' : 'tm-tool-tag--off'}`}>
                      {enabled ? t('agent.knowledge.bound') : t('agent.knowledge.unbound')}
                    </span>
                    <span className="tm-knowledge-item-meta">
                      {t('agent.knowledge.docMeta', {
                        documents: kb.documentCount,
                        chunks: kb.chunkCount,
                      })}
                    </span>
                  </div>
                </div>
                <div className="tm-skill-card-actions">
                  {enabled ? (
                    <button
                      type="button"
                      className="tm-btn tm-btn--ghost tm-btn--sm"
                      onClick={() => setExpandedKbId(expanded ? null : kb.id)}
                    >
                      {expanded ? t('common.collapse') : t('agent.knowledge.retrievalParams')}
                    </button>
                  ) : null}
                  <Toggle checked={enabled} onChange={(value) => onKbToggle(kb.id, value)} />
                </div>
              </div>

              {enabled && expanded ? (
                <div className="tm-agent-kb-per-settings">
                  <label className="tm-form-field">
                    <span className="tm-form-label">{t('agent.knowledge.topKOverride')}</span>
                    <input
                      className="tm-form-input"
                      type="number"
                      min={1}
                      max={20}
                      value={perKb?.topK ?? ''}
                      placeholder={t('agent.knowledge.useGlobalDefault')}
                      onChange={(event) =>
                        onKbSettingChange(kb.id, {
                          ...perKb,
                          topK: parseOptionalNumber(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="tm-form-field">
                    <span className="tm-form-label">{t('agent.knowledge.thresholdOverride')}</span>
                    <input
                      className="tm-form-input"
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={perKb?.scoreThreshold ?? ''}
                      placeholder={t('agent.knowledge.useGlobalOrKb')}
                      onChange={(event) =>
                        onKbSettingChange(kb.id, {
                          ...perKb,
                          scoreThreshold: parseOptionalNumber(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
