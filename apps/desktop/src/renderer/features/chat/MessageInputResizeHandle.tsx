import { useI18n } from '../../i18n/useI18n'

export function MessageInputResizeHandle({ onResizeStart }: { onResizeStart: (startY: number) => void }) {
  const { t } = useI18n()
  return (
    <div
      className="tm-input-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('chat.input.resizeHandle')}
      title={t('chat.input.resizeHandleTitle')}
      onPointerDown={(e) => {
        e.preventDefault()
        onResizeStart(e.clientY)
      }}
    >
      <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M4 0L10 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M7 0L10 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  )
}
