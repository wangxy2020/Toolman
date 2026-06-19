export function StreamingPlaceholder() {
  return (
    <div className="tm-stream-waiting" aria-live="polite" aria-busy="true" aria-label="正在生成回复">
      <span className="tm-stream-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}
