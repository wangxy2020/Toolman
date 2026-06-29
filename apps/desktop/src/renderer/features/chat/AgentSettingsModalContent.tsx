import { AgentSettingsModalBasicTab } from './AgentSettingsModalTabs'
import { AgentSettingsModalSecondaryTabs } from './AgentSettingsModalSecondaryTabs'
import type { SettingsTab } from './agent-settings-modal-types'
import type { useAgentSettingsModal } from './useAgentSettingsModal'

type AgentSettingsState = ReturnType<typeof useAgentSettingsModal>

interface AgentSettingsModalContentProps {
  activeTab: SettingsTab
  state: AgentSettingsState
}

export function AgentSettingsModalContent({ activeTab, state }: AgentSettingsModalContentProps) {
  if (activeTab === 'basic') {
    return <AgentSettingsModalBasicTab state={state} />
  }

  return <AgentSettingsModalSecondaryTabs state={state} />
}
