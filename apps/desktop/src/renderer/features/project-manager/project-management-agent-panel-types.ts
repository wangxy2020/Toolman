import type { PmProject } from '@toolman/shared'
import type { ChatPageState } from '../chat/useChatPage'
import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'

export type ProjectManagementAgentPanelProps = Pick<
  ChatPageState,
  | 'chat'
  | 'messageSettings'
  | 'messagePanelStyle'
  | 'defaultModelId'
  | 'translationLanguages'
  | 'groupProxyReadOnly'
  | 'appSettings'
  | 'systemPaths'
  | 'agentPrefillText'
  | 'agentPrefillAttachments'
  | 'chatPrefillRevision'
  | 'handleEditUserMessage'
  | 'handlePrefillConsumed'
  | 'updateAppSettings'
  | 'notes'
  | 'setActiveView'
> & {
  workspaceId: string | null
  activeTab: ConfigurableSidebarMenuKey
  selectedProjectId?: string | null
  projects?: PmProject[]
  /** After create-dialog confirm: auto-send plan kickoff for this project. */
  agentKickoffProject?: PmProject | null
  onAgentKickoffConsumed?: () => void
  onPlanApplied?: (projectId: string) => void
  onProjectsChange?: () => void | Promise<void>
  workspace?: import('@toolman/shared').Workspace | null
}
