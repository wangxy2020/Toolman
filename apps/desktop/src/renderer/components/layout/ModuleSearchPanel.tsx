import { useEffect, useRef, useState } from 'react'
import { IconSearch } from '../icons'
import { getModulePageConfig } from '../../features/modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import type { ModuleView } from '../../types/app-view'

interface Props {
  view: ModuleView
  onClose: () => void
}

export function ModuleSearchPanel({ view, onClose }: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig(view, t)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tm-search-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            type="search"
            className="tm-search-input"
            placeholder={t('modulesSearch.placeholder', { module: config.title })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="tm-search-results">
          <div className="tm-empty">
            {query.trim()
              ? t('modulesSearch.developing', { module: config.title, query: query.trim() })
              : config.sidebarEmptyHint}
          </div>
        </div>
      </div>
    </div>
  )
}
