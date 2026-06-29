export function MessagePanelActionButton({
  title,
  onClick,
  disabled,
  active,
  loading,
  children,
}: {
  title: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  active?: boolean
  loading?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={[
        'tm-stream-action-btn',
        active ? 'tm-stream-action-btn--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={loading ? `${title}（处理中…）` : title}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
