import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider, type ProviderModel } from '@toolman/shared'
import { IconChevronRight, IconPlus, IconSearch } from '../../components/icons'
import { IconRefresh } from '../../components/nav-module-icons'
import { useI18n } from '../../i18n/useI18n'
import { getModelCategoryLabel, getProviderPresetDisplayName } from '../../i18n/settings-labels'
import { ModelCapabilityTags } from './ModelCapabilityTags'
import type { ProviderPreset } from './provider-presets'
import {
  createProviderModel,
  groupProviderModels,
  inferModelGroup,
  modelMatchesCategory,
  type ModelCategory,
} from './provider-model-utils'

interface Props {
  provider: Provider
  preset: ProviderPreset
  installedModels: ProviderModel[]
  onClose: () => void
  onSave: (models: ProviderModel[]) => Promise<void>
}

function IconMinus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

const CATEGORIES: ModelCategory[] = [
  'all',
  'reasoning',
  'vision',
  'web',
  'free',
  'embedding',
  'rerank',
  'tools',
]

export function ModelPickerModal({ provider, preset, installedModels, onClose, onSave }: Props) {
  const { t } = useI18n()
  const [remoteModels, setRemoteModels] = useState<ProviderModel[]>([])
  const [installed, setInstalled] = useState<ProviderModel[]>(installedModels)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ModelCategory>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const installedIds = useMemo(() => new Set(installed.map((m) => m.id)), [installed])

  const fetchRemote = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.ProviderFetchModels, {
      id: provider.id,
      persist: false,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { models: ProviderModel[] }
    setRemoteModels(data.models.map((m) => createProviderModel(m.id, { name: m.name })))
  }, [provider.id])

  useEffect(() => {
    void fetchRemote()
  }, [fetchRemote])

  useEffect(() => {
    setInstalled(installedModels)
  }, [installedModels])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return remoteModels.filter((model) => {
      if (!modelMatchesCategory(model, category, provider.type)) return false
      if (!q) return true
      return model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q)
    })
  }, [remoteModels, category, query, provider.type])

  const grouped = useMemo(() => groupProviderModels(filtered), [filtered])

  const toggleModel = (model: ProviderModel, add: boolean) => {
    setInstalled((prev) => {
      if (add) {
        if (prev.some((m) => m.id === model.id)) return prev
        const existing = installedModels.find((m) => m.id === model.id)
        return [...prev, existing ?? createProviderModel(model.id, { name: model.name })]
      }
      return prev.filter((m) => m.id !== model.id)
    })
  }

  const addGroup = (groupKey: string) => {
    const groupModels = filtered.filter(
      (m) => inferModelGroup(m.id, m.group) === groupKey,
    )
    setInstalled((prev) => {
      const next = [...prev]
      for (const model of groupModels) {
        if (!next.some((m) => m.id === model.id)) {
          const existing = installedModels.find((m) => m.id === model.id)
          next.push(existing ?? createProviderModel(model.id, { name: model.name }))
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(installed)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-model-picker-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">
            {t('settings.models.picker.title', { name: getProviderPresetDisplayName(preset, t) })}
          </h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-model-picker-toolbar">
          <div className="tm-model-picker-search">
            <IconSearch size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settings.models.picker.searchPlaceholder')}
            />
          </div>
          <button
            type="button"
            className="tm-model-picker-icon-btn"
            title={t('settings.models.picker.refresh')}
            disabled={loading}
            onClick={() => void fetchRemote()}
          >
            <IconRefresh size={16} />
          </button>
        </div>

        <div className="tm-model-picker-tabs">
          {CATEGORIES.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tm-model-picker-tab ${category === tab ? 'tm-model-picker-tab--active' : ''}`}
              onClick={() => setCategory(tab)}
            >
              {getModelCategoryLabel(tab, t)}
            </button>
          ))}
        </div>

        <div className="tm-model-picker-body">
          {loading && <p className="tm-model-picker-status">{t('settings.models.picker.loading')}</p>}
          {error && <p className="tm-model-picker-status tm-model-picker-status--error">{error}</p>}
          {!loading && !error && grouped.length === 0 && (
            <p className="tm-model-picker-status">{t('settings.models.picker.noResults')}</p>
          )}

          {grouped.map((group) => {
            const collapsed = collapsedGroups[group.key] ?? false
            return (
              <div key={group.key} className="tm-model-picker-group">
                <div className="tm-model-picker-group-header">
                  <button
                    type="button"
                    className="tm-model-picker-group-toggle"
                    onClick={() =>
                      setCollapsedGroups((prev) => ({ ...prev, [group.key]: !collapsed }))
                    }
                  >
                    <IconChevronRight size={14} open={!collapsed} />
                    <span>{group.key}</span>
                    <span className="tm-model-picker-group-count">{group.items.length}</span>
                  </button>
                  <button
                    type="button"
                    className="tm-model-picker-group-add"
                    title={t('settings.models.picker.addGroup')}
                    onClick={() => addGroup(group.key)}
                  >
                    <IconPlus size={14} />
                  </button>
                </div>

                {!collapsed &&
                  group.items.map((model) => {
                    const isInstalled = installedIds.has(model.id)
                    return (
                      <div key={model.id} className="tm-model-picker-item">
                        <div className="tm-model-picker-item-main">
                          <span className="tm-provider-model-icon" aria-hidden />
                          <span className="tm-model-picker-item-name">{model.name}</span>
                          <ModelCapabilityTags model={model} />
                        </div>
                        <button
                          type="button"
                          className={`tm-model-picker-toggle ${isInstalled ? 'tm-model-picker-toggle--remove' : ''}`}
                          title={isInstalled ? t('settings.models.picker.remove') : t('settings.models.picker.add')}
                          onClick={() => toggleModel(model, !isInstalled)}
                        >
                          {isInstalled ? <IconMinus /> : <IconPlus size={14} />}
                        </button>
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>

        <footer className="tm-model-picker-footer">
          <span className="tm-model-picker-footer-hint">
            {t('settings.models.picker.selectedCount', { count: installed.length })}
          </span>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? t('common.saving') : t('settings.models.picker.done')}
          </button>
        </footer>
      </div>
    </div>
  )
}
