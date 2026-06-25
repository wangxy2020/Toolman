import type { Assistant } from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  assistant: Assistant | null
  onOpenSettings: () => void
}

export function AssistantNameSelector({ assistant, onOpenSettings }: Props) {
  const { t } = useI18n()
  const name = assistant?.name ?? t('agent.fallbackName')

  return (
    <button
      type="button"
      className="tm-model-pill tm-agent-pill"
      onClick={onOpenSettings}
      title={t('agent.settingsButton')}
    >
      {assistant?.isPinned && <span className="tm-agent-pill-star">★</span>}
      <span className="tm-agent-pill-label">{name}</span>
      <IconChevronDown />
    </button>
  )
}
