interface Props {
  letter: string
  pulsing?: boolean
  size?: number
}

export function AgentTaskHexIcon({ letter, pulsing = false, size = 36 }: Props) {
  return (
    <span
      className={['tm-agent-task-hex-icon', pulsing ? 'tm-agent-task-hex-icon--pulse' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 40 44" fill="none" className="tm-agent-task-hex-icon-svg">
        <path
          d="M20 2L36.124 11v22L20 42 3.876 33V11L20 2z"
          className="tm-agent-task-hex-icon-shape"
        />
        <path
          d="M20 6.5L31.5 13.25v13.5L20 33.5 8.5 26.75v-13.5L20 6.5z"
          className="tm-agent-task-hex-icon-inner"
        />
      </svg>
      <span className="tm-agent-task-hex-icon-letter">{letter}</span>
    </span>
  )
}
