import { useChatPageAssistant } from './useChatPageAssistant'
import { useChatPageInterop } from './useChatPageInterop'
import type { MessageSettings } from './message-settings'
import type { useChat } from './useChat'
import type { useNotes } from '../notes/useNotes'
import type { useP2pWorkspaces } from '../group/useP2pWorkspaces'
import type { useSystemPaths } from './useSystemPaths'
import type { Workspace } from '@toolman/shared'
import type { AppView } from '../../types/app-view'

export function useChatPageCrossModule(deps: {
  chat: ReturnType<typeof useChat>
  notes: ReturnType<typeof useNotes>
  p2pWorkspaces: ReturnType<typeof useP2pWorkspaces>
  systemPaths: ReturnType<typeof useSystemPaths>
  workspaceId: string | null
  workspace: Workspace | null
  setWorkspace: (workspace: Workspace) => void
  setActiveView: (view: AppView) => void
  messageSettings: MessageSettings
}) {
  const assistant = useChatPageAssistant(deps.chat, deps.messageSettings)
  const interop = useChatPageInterop({
    ...deps,
    activeAssistantId: assistant.activeAssistant?.id,
  })

  return {
    ...assistant,
    ...interop,
  }
}
