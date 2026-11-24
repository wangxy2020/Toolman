import { useChatPageAssistant } from './useChatPageAssistant'
import { useChatPageInterop } from './useChatPageInterop'
import type { MessageSettings } from './message-settings'
import type { useChat } from './useChat'
import type { useNotes } from '../notes/useNotes'
import type { useP2pWorkspaces } from '../group/useP2pWorkspaces'
import type { useSystemPaths } from './useSystemPaths'
import type { KnowledgeBase, Workspace } from '@toolman/shared'
import type { AppView } from '../../types/app-view'
import type { AppSettings } from '../settings/app-settings'

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
  activeKnowledgeBase?: KnowledgeBase | null
  appSettings?: AppSettings
  updateAppSettings?: (patch: Partial<AppSettings>) => void
}) {
  const assistant = useChatPageAssistant(deps.chat, deps.messageSettings, deps.appSettings)
  const interop = useChatPageInterop({
    ...deps,
    activeAssistant: assistant.activeAssistant ?? undefined,
    activeKnowledgeBase: deps.activeKnowledgeBase ?? null,
  })

  return {
    ...assistant,
    ...interop,
  }
}
