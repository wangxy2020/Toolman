import { useEffect, useMemo, useRef, useState } from 'react'
import type { Provider } from '@toolman/shared'
import {
  MAX_PARALLEL_MODELS,
  buildModelOptions,
  modelNameFromId,
  providerNameFromModelId,
  toggleModelId,
} from './model-utils'
import { IconChevronDown } from '../../components/icons'

interface Props {
  providers: Provider[]
  selectedModelIds: string[]
  onChange: (modelIds: string[]) => void
  readOnly?: boolean
}

export function MultiModelSelector({ providers, selectedModelIds, onChange, readOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const options = useMemo(() => buildModelOptions(providers), [providers])

  const primaryModelId = selectedModelIds[0] ?? null

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  if (options.length === 0 || !primaryModelId) {
    return <span className="tm-model-pill tm-model-pill--muted">未配置模型</span>
  }

  const modelLabel = modelNameFromId(primaryModelId)
  const providerLabel = providerNameFromModelId(primaryModelId, providers)
  const extraCount = selectedModelIds.length - 1
  const displayLabel = [
    modelLabel,
    providerLabel ? ` | ${providerLabel}` : '',
    extraCount > 0 ? ` +${extraCount}` : '',
  ].join('')

  if (readOnly) {
    return (
      <span className="tm-model-pill tm-model-select-pill tm-model-pill--static" title={displayLabel}>
        <span className="tm-model-select-pill-label">
          {modelLabel}
          {providerLabel && <span className="tm-model-pill-provider">| {providerLabel}</span>}
          {extraCount > 0 && <span className="tm-model-pill-extra">+{extraCount}</span>}
        </span>
      </span>
    )
  }

  return (
    <div className="tm-model-selector" ref={wrapRef}>
      <button
        type="button"
        className="tm-model-pill tm-model-select-pill"
        onClick={() => setOpen((v) => !v)}
        title={displayLabel}
      >
        <span className="tm-model-select-pill-label">
          {modelLabel}
          {providerLabel && <span className="tm-model-pill-provider">| {providerLabel}</span>}
          {extraCount > 0 && <span className="tm-model-pill-extra">+{extraCount}</span>}
        </span>
        <IconChevronDown />
      </button>

      {open && (
        <div className="tm-model-panel">
          <div className="tm-model-panel-hint">
            选择模型（最多 {MAX_PARALLEL_MODELS} 个，已选 {selectedModelIds.length}）
          </div>
          <div className="tm-model-panel-list">
            {options.map((opt) => {
              const selected = selectedModelIds.includes(opt.modelId)
              const disabled = !selected && selectedModelIds.length >= MAX_PARALLEL_MODELS
              return (
                <button
                  key={opt.modelId}
                  type="button"
                  className={`tm-model-option ${selected ? 'tm-model-option--selected' : ''}`}
                  disabled={disabled}
                  onClick={() => {
                    if (!selected && selectedModelIds.length === 1) {
                      onChange([opt.modelId])
                      return
                    }
                    onChange(toggleModelId(selectedModelIds, opt.modelId))
                  }}
                >
                  <span className="tm-model-option-check">{selected ? '✓' : ''}</span>
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
