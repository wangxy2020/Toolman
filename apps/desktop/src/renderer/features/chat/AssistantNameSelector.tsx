import type { Assistant } from '@toolman/shared'
import {
  isAssistantLibAssistantName,
  isAutomationAssistantName,
  PROJECT_MANAGEMENT_ASSISTANT_NAME,
} from '@toolman/shared'
import { IconChevronDown } from '../../components/icons'
import { resolveGroupProxyAssistantDisplayName, isGroupProxyAssistant } from '../../features/group/group-agent-utils'
import { useI18n } from '../../i18n/useI18n'
import { translateAssistantName } from '../../i18n/system-labels'

interface Props {
  assistant: Assistant | null
  onOpenSettings: () => void
}

/** Keep ★ for 项目管理 / 课堂 / 自动化; hide for 通用智能体. */
function shouldShowPinnedStar(assistant: Assistant): boolean {
  if (!assistant.isPinned) return false
  if (assistant.name === PROJECT_MANAGEMENT_ASSISTANT_NAME) return true
  if (isAssistantLibAssistantName(assistant.name)) return true
  if (isAutomationAssistantName(assistant.name)) return true
  return false
}

export function AssistantNameSelector({ assistant, onOpenSettings }: Props) {
  const { t } = useI18n()
  const name = assistant
    ? isGroupProxyAssistant(assistant)
      ? resolveGroupProxyAssistantDisplayName(assistant)
      : translateAssistantName(assistant.name, t)
    : t('agent.fallbackName')

  return (
    <button
      type="button"
      className="tm-model-pill tm-agent-pill"
      onClick={onOpenSettings}
      title={t('agent.settingsButton')}
    >
      {assistant && shouldShowPinnedStar(assistant) ? (
        <span className="tm-agent-pill-star">★</span>
      ) : null}
      <span className="tm-agent-pill-label">{name}</span>
      <IconChevronDown />
    </button>
  )
}
