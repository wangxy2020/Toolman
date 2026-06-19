export function ThinkingHeartbeat() {
  return (
    <div className="tm-thinking-heartbeat" aria-live="polite" aria-busy="true" aria-label="正在思考">
      <span className="tm-thinking-heartbeat-pulse" aria-hidden="true" />
      <span className="tm-stream-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}
