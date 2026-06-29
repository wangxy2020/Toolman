import { GroupPage } from '../group/GroupPage'
import type { ChatPageState } from './useChatPage'

export type ChatPageGroupViewProps = Pick<
  ChatPageState,
  | 'p2pWorkspaces'
  | 'workspaceId'
  | 'knowledge'
  | 'chat'
  | 'notes'
  | 'setShowGroupInvite'
  | 'handleP2pWorkspaceUpdated'
  | 'handleP2pWorkspaceLeft'
  | 'handleOpenNote'
  | 'handleOpenGroupNote'
  | 'handleSyncGroupNoteLock'
  | 'handleOpenGroupKnowledgeMarkdown'
  | 'handleSaveGroupNoteAsCopy'
  | 'handleOpenGroupAgentSession'
  | 'handleReloadAssistants'
  | 'messageSettings'
  | 'appSettings'
  | 'systemPaths'
  | 'registrationGate'
  | 'setShowMembershipUpgrade'
>

export function ChatPageGroupView({
  p2pWorkspaces,
  workspaceId,
  knowledge,
  chat,
  notes,
  setShowGroupInvite,
  handleP2pWorkspaceUpdated,
  handleP2pWorkspaceLeft,
  handleOpenNote,
  handleOpenGroupNote,
  handleSyncGroupNoteLock,
  handleOpenGroupKnowledgeMarkdown,
  handleSaveGroupNoteAsCopy,
  handleOpenGroupAgentSession,
  handleReloadAssistants,
  messageSettings,
  appSettings,
  systemPaths,
  registrationGate,
  setShowMembershipUpgrade,
}: ChatPageGroupViewProps) {
  return (
    <GroupPage
      workspace={p2pWorkspaces.active}
      sourceWorkspaceId={workspaceId}
      knowledgeBases={knowledge.items}
      assistants={chat.assistants}
      sessions={chat.sessions}
      notebooks={notes.data.notebooks}
      notes={notes.notes}
      syncFolderPath={notes.data.syncFolderPath}
      onInvite={p2pWorkspaces.active ? () => setShowGroupInvite(true) : undefined}
      onWorkspaceUpdated={handleP2pWorkspaceUpdated}
      onWorkspaceLeft={handleP2pWorkspaceLeft}
      onOpenNote={handleOpenNote}
      onOpenGroupNote={handleOpenGroupNote}
      onSyncGroupNoteLock={handleSyncGroupNoteLock}
      onOpenGroupKnowledgeMarkdown={handleOpenGroupKnowledgeMarkdown}
      onKnowledgeBasesChanged={() => void knowledge.load()}
      onSaveGroupNoteAsCopy={handleSaveGroupNoteAsCopy}
      onOpenGroupAgentSession={handleOpenGroupAgentSession}
      onReloadAssistants={handleReloadAssistants}
      messageSettings={messageSettings}
      spellCheckEnabled={appSettings.spellCheckEnabled}
      defaultFilePath={systemPaths?.documents ?? systemPaths?.home ?? null}
      requireRegistration={registrationGate.requireRegistration}
      onUpgradeMembership={() => setShowMembershipUpgrade(true)}
    />
  )
}
