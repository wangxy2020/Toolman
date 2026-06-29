import { useI18n } from '../../i18n/useI18n'

export function NotesSidebarTags({
  tags,
  activeTagFilter,
  onTagFilterChange,
}: {
  tags: string[]
  activeTagFilter: string | null
  onTagFilterChange: (tag: string | null) => void
}) {
  const { t } = useI18n()

  if (tags.length === 0) return null

  return (
    <div className="tm-notes-sidebar-tags">
      <button
        type="button"
        className={[
          'tm-notes-sidebar-tag-btn',
          activeTagFilter === null ? 'tm-notes-sidebar-tag-btn--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onTagFilterChange(null)}
      >
        {t('common.all')}
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={[
            'tm-notes-sidebar-tag-btn',
            activeTagFilter === tag ? 'tm-notes-sidebar-tag-btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onTagFilterChange(activeTagFilter === tag ? null : tag)}
        >
          #{tag}
        </button>
      ))}
    </div>
  )
}

export function NotesSidebarFilterHint({
  searchQuery,
  activeTagFilter,
  onClear,
}: {
  searchQuery: string
  activeTagFilter: string | null
  onClear: () => void
}) {
  const { t } = useI18n()
  const filtering = Boolean(searchQuery.trim() || activeTagFilter)
  if (!filtering) return null

  return (
    <div className="tm-notes-sidebar-filter-hint">
      <span>
        {t('sidebar.notes.filtered', {
          query: searchQuery.trim() ? `「${searchQuery.trim()}」` : '',
          tag: activeTagFilter ? ` #${activeTagFilter}` : '',
        })}
      </span>
      <button type="button" className="tm-notes-sidebar-import-btn" onClick={onClear}>
        {t('common.clear')}
      </button>
    </div>
  )
}
