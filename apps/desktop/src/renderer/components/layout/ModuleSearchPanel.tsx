import { useEffect, useRef, useState } from 'react'
import { IconSearch } from '../icons'
import { getModulePageConfig } from '../../features/modules/module-config'
import type { ModuleView } from '../../types/app-view'

interface Props {
  view: ModuleView
  onClose: () => void
}

export function ModuleSearchPanel({ view, onClose }: Props) {
  const config = getModulePageConfig(view)
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
            placeholder={`搜索${config.title}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="tm-search-results">
          <div className="tm-empty">
            {query.trim()
              ? `「${config.title}」搜索功能开发中，暂无「${query.trim()}」相关结果。`
              : config.sidebarEmptyHint}
          </div>
        </div>
      </div>
    </div>
  )
}
