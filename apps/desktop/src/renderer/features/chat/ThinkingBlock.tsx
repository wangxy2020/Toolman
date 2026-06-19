import { useState } from 'react'
import { IconChevronRight, IconThinking } from '../../components/icons'
import { ThinkingHeartbeat } from './ThinkingHeartbeat'

interface Props {
  text: string
  defaultCollapsed?: boolean
  active?: boolean
  durationSeconds?: number
}

export function ThinkingBlock({
  text,
  defaultCollapsed = true,
  active = false,
  durationSeconds = 0,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  if (!text.trim()) return null

  const showDuration = active || durationSeconds > 0

  return (
    <div
      className={[
        'tm-thinking-block',
        collapsed ? 'tm-thinking-block--collapsed' : '',
        active ? 'tm-thinking-block--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="tm-thinking-block-head"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        title={collapsed ? '展开思考过程' : '折叠思考过程'}
      >
        <IconChevronRight
          className={['tm-thinking-block-chevron', collapsed ? '' : 'tm-thinking-block-chevron--open'].join(
            ' ',
          )}
        />
        <span className="tm-thinking-block-icon" aria-hidden="true">
          <IconThinking size={14} className={active ? 'tm-thinking-icon--active' : undefined} />
        </span>
        <span className="tm-thinking-block-title">思考过程</span>
        {showDuration ? (
          <span className="tm-thinking-block-duration">{durationSeconds}s</span>
        ) : null}
      </button>
      {!collapsed ? <pre className="tm-thinking-block-body">{text}</pre> : null}
      {active ? <ThinkingHeartbeat /> : null}
    </div>
  )
}
