import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IpcChannel, resolveGroupSavedKnowledgeSidebarLabel, type KnowledgeBase } from '@toolman/shared'
import { IconChevronRight } from '../../components/icons'
import type { TranslateFn } from '../../i18n/I18nProvider'
import { useI18n } from '../../i18n/useI18n'
import { getKnowledgeSidebarSectionLabel } from '../../i18n/knowledge-sidebar-labels'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import { GroupPickerCheckbox } from '../group/group-resource-picker-modal-components'
import {
  groupAgentBindableKnowledgeBases,
  type AgentBindableKbSection,
} from '../knowledge/agent-knowledge-bind'
import { SYSTEM_DEFAULT_FOLDER_KB_NAMES } from '../knowledge/knowledge-sidebar-types'

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
  onKbIdsChange: (next: string[]) => void
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

function resolveBindableKbLabel(kb: KnowledgeBase, t: TranslateFn): string {
  if (SYSTEM_DEFAULT_FOLDER_KB_NAMES.has(kb.name)) {
    return translateKnowledgeFolderName(kb.name, t)
  }
  if (kb.kind === 'shared') {
    return resolveGroupSavedKnowledgeSidebarLabel(kb)
  }
  return kb.name
}

export function AgentSettingsKnowledgeTab({
  workspaceId,
  kbIds,
  kbTopK,
  kbScoreThreshold,
  kbSettings,
  onKbIdsChange,
  onKbTopKChange,
  onKbScoreThresholdChange,
  onKbSettingChange,
}: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<KnowledgeBase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<AgentBindableKbSection>>(
    () => new Set(['local']),
  )
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null)
  const didInitExpand = useRef(false)

  const groups = useMemo(() => groupAgentBindableKnowledgeBases(items), [items])
  const selected = useMemo(() => new Set(kbIds), [kbIds])

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.KnowledgeBaseList, { workspaceId })
    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { items: KnowledgeBase[] }
    setItems(data.items)
    setError(null)
  }, [workspaceId])

  useEffect(() => {
    didInitExpand.current = false
    void load()
  }, [load])

  useEffect(() => {
    if (didInitExpand.current || items.length === 0) return
    didInitExpand.current = true
    setExpandedSections((prev) => {
      const next = new Set(prev)
      next.add('local')
      for (const group of groups) {
        if (group.items.some((kb) => selected.has(kb.id))) next.add(group.id)
      }
      return next
    })
  }, [groups, items.length, selected])

  const toggleSection = (id: AgentBindableKbSection) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleKb = (kbId: string, enabled: boolean) => {
    onKbIdsChange(enabled ? [...new Set([...kbIds, kbId])] : kbIds.filter((id) => id !== kbId))
  }

  const toggleSectionIds = (sectionIds: string[], enable: boolean) => {
    if (sectionIds.length === 0) return
    if (enable) {
      onKbIdsChange([...new Set([...kbIds, ...sectionIds])])
      return
    }
    const drop = new Set(sectionIds)
    onKbIdsChange(kbIds.filter((id) => !drop.has(id)))
  }

  const bindableCount = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <div className="tm-agent-tab-panel tm-agent-tab-panel--knowledge">
      {error ? <div className="tm-settings-error">{error}</div> : null}

      <div className="tm-agent-tab-head">
        <h3 className="tm-agent-tab-title">{t('agent.knowledge.bindTitle')}</h3>
      </div>

      <p className="tm-knowledge-detail-hint">{t('agent.knowledge.bindHint')}</p>

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

      {!loading && bindableCount === 0 ? (
        <p className="tm-knowledge-detail-hint">{t('agent.knowledge.empty')}</p>
      ) : null}

      {!loading ? (
        <div className="tm-agent-kb-tree">
          {groups.map((group) => {
            const sectionLabel = getKnowledgeSidebarSectionLabel(group.id, t)
            const isOpen = expandedSections.has(group.id)
            const selectedInSection = group.items.filter((kb) => selected.has(kb.id)).length
            const allSelected = group.items.length > 0 && selectedInSection === group.items.length
            const someSelected = selectedInSection > 0 && !allSelected

            return (
              <section key={group.id} className="tm-agent-kb-section">
                <div className="tm-agent-kb-section-row">
                  <button
                    type="button"
                    className="tm-agent-kb-section-toggle"
                    aria-expanded={isOpen}
                    title={isOpen ? t('common.collapse') : t('common.expand')}
                    onClick={() => toggleSection(group.id)}
                  >
                    <IconChevronRight size={14} open={isOpen} />
                    <span className="tm-agent-kb-section-name">{sectionLabel}</span>
                    <span className="tm-agent-kb-section-count">
                      {t('agent.knowledge.sectionCount', {
                        selected: String(selectedInSection),
                        total: String(group.items.length),
                      })}
                    </span>
                  </button>
                  <span
                    className="tm-agent-kb-section-check"
                    title={t('agent.knowledge.selectSection', { name: sectionLabel })}
                  >
                    <GroupPickerCheckbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      disabled={group.items.length === 0}
                      onChange={() =>
                        toggleSectionIds(
                          group.items.map((kb) => kb.id),
                          !allSelected,
                        )
                      }
                    />
                  </span>
                </div>

                {isOpen ? (
                  <div className="tm-agent-kb-children">
                    {group.items.length === 0 ? (
                      <p className="tm-agent-kb-empty">{t('agent.knowledge.sectionEmpty')}</p>
                    ) : (
                      group.items.map((kb) => {
                        const enabled = selected.has(kb.id)
                        const perKb = kbSettings?.[kb.id]
                        const paramsOpen = enabled && expandedKbId === kb.id

                        return (
                          <div key={kb.id} className="tm-agent-kb-item">
                            <div className="tm-agent-kb-item-row">
                              <button
                                type="button"
                                className="tm-agent-kb-item-main"
                                onClick={() => toggleKb(kb.id, !enabled)}
                              >
                                <div className="tm-agent-kb-item-name">{resolveBindableKbLabel(kb, t)}</div>
                                <div className="tm-agent-kb-item-meta">
                                  {t('agent.knowledge.docMeta', {
                                    documents: kb.documentCount,
                                    chunks: kb.chunkCount,
                                  })}
                                </div>
                              </button>
                              {enabled ? (
                                <button
                                  type="button"
                                  className="tm-btn tm-btn--ghost tm-btn--sm"
                                  onClick={() => setExpandedKbId(paramsOpen ? null : kb.id)}
                                >
                                  {paramsOpen ? t('common.collapse') : t('agent.knowledge.retrievalParams')}
                                </button>
                              ) : null}
                              <GroupPickerCheckbox
                                checked={enabled}
                                onChange={() => toggleKb(kb.id, !enabled)}
                              />
                            </div>

                            {paramsOpen ? (
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
                      })
                    )}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
