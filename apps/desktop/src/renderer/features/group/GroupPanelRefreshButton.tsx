import { IconRefresh } from '../../components/icons'

interface Props {
  loading?: boolean
  disabled?: boolean
  title?: string
  onRefresh: () => void
}

export function GroupPanelRefreshButton({
  loading = false,
  disabled = false,
  title = '刷新',
  onRefresh,
}: Props) {
  return (
    <button
      type="button"
      className="tm-community-panel-icon-btn"
      title={title}
      aria-label={title}
      disabled={disabled || loading}
      onClick={onRefresh}
    >
      <IconRefresh size={16} className={loading ? 'tm-icon-spin' : undefined} />
    </button>
  )
}
