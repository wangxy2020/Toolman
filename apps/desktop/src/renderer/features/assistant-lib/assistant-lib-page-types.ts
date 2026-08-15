import type { ChatPageState } from '../chat/useChatPage'

export type AssistantLibPageProps = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'chat'
  | 'messageSettings'
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
  | 'handleReloadAssistants'
  | 'setStatusMessage'
  | 'knowledgeFolder'
>
