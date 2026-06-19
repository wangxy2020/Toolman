import type { Assistant } from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'

interface Props {
  assistant: Assistant | null
  onOpenSettings: () => void
}

export function AssistantNameSelector({ assistant, onOpenSettings }: Props) {
  const name = assistant?.name ?? '智能体'

  return (
    <button
      type="button"
      className="tm-model-pill tm-agent-pill"
      onClick={onOpenSettings}
      title="智能体设置"
    >
      {assistant?.isPinned && <span className="tm-agent-pill-star">★</span>}
      <span className="tm-agent-pill-label">{name}</span>
      <IconChevronDown />
    </button>
  )
}
