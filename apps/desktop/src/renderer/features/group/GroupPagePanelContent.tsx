import type { UseGroupPageResult } from './useGroupPage'
import type { GroupPageProps } from './group-page-component-types'
import { GroupMemberChatPanel } from './GroupMemberChatPanel'
import { GroupActivityLog } from './GroupActivityLog'
import { GroupKnowledgePanel } from './GroupKnowledgePanel'
import { GroupAgentsPanel } from './GroupAgentsPanel'
import { GroupNotesPanel } from './GroupNotesPanel'
import { GroupWorkflowPanel } from './GroupWorkflowPanel'

type GroupPagePanelContentProps = GroupPageProps &
  Pick<
    UseGroupPageResult,
    'workspaceName' | 'effectiveAction' | 'detail' | 'activity'
  >

export function GroupPagePanelContent({
  workspace,
  sourceWorkspaceId,
  knowledgeBases,
  assistants,
  sessions,
  notebooks,
  notes,
  syncFolderPath = null,
  messageSettings,
  spellCheckEnabled = true,
  defaultFilePath = null,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onKnowledgeBasesChanged,
  onSaveGroupNoteAsCopy,
  onOpenGroupAgentSession,
  onReloadAssistants,
  onSyncGroupNoteLock,
  workspaceName,
  effectiveAction,
  detail,
  activity,
}: GroupPagePanelContentProps) {
  if (!workspace) return null

  switch (effectiveAction) {
    case 'messages':
      return (
        <GroupMemberChatPanel
          workspaceId={workspace.id}
          workspaceName={workspaceName}
          selfMemberId={detail.selfMember?.id ?? null}
          isOwner={detail.isOwner}
          canWriteWorkspace={detail.canWriteWorkspace}
          messageSettings={messageSettings}
          spellCheckEnabled={spellCheckEnabled}
          defaultFilePath={defaultFilePath}
        />
      )
    case 'activity':
      return (
        <GroupActivityLog
          workspaceName={workspaceName}
          events={activity.events}
          loading={activity.loading}
          error={activity.error}
          onRefresh={() => void activity.load()}
        />
      )
    case 'knowledge':
      return (
        <GroupKnowledgePanel
          p2pWorkspaceId={workspace.id}
          workspaceName={workspaceName}
          sourceWorkspaceId={sourceWorkspaceId}
          knowledgeBases={knowledgeBases}
          canManageGroupResources={detail.canManageMembers}
          canWriteWorkspace={detail.canWriteWorkspace}
          members={detail.members}
          selfMemberId={detail.selfMember?.id ?? null}
          onOpenNote={onOpenNote}
          onOpenGroupNote={onOpenGroupNote}
          onOpenGroupKnowledgeMarkdown={onOpenGroupKnowledgeMarkdown}
          onKnowledgeBasesChanged={onKnowledgeBasesChanged}
        />
      )
    case 'agents':
      return (
        <GroupAgentsPanel
          p2pWorkspaceId={workspace.id}
          workspaceName={workspaceName}
          sourceWorkspaceId={sourceWorkspaceId}
          assistants={assistants}
          sessions={sessions}
          canManageGroupResources={detail.canManageMembers}
          canWriteWorkspace={detail.canWriteWorkspace}
          members={detail.members}
          selfMemberId={detail.selfMember?.id ?? null}
          onOpenGroupAgentSession={onOpenGroupAgentSession}
          onReloadAssistants={onReloadAssistants}
        />
      )
    case 'notes':
      return (
        <GroupNotesPanel
          p2pWorkspaceId={workspace.id}
          workspaceName={workspaceName}
          notebooks={notebooks}
          notes={notes}
          syncFolderPath={syncFolderPath}
          canManageGroupResources={detail.canManageMembers}
          canWriteWorkspace={detail.canWriteWorkspace}
          members={detail.members}
          selfMemberId={detail.selfMember?.id ?? null}
          selfMemberRole={detail.selfMember?.role ?? null}
          onOpenGroupNote={onOpenGroupNote}
          onSaveGroupNoteAsCopy={onSaveGroupNoteAsCopy}
          onSyncGroupNoteLock={onSyncGroupNoteLock}
        />
      )
    case 'workflow':
      return (
        <GroupWorkflowPanel
          p2pWorkspaceId={workspace.id}
          workspaceName={workspaceName}
          sourceWorkspaceId={sourceWorkspaceId}
          canManageGroupResources={detail.canManageMembers}
          canWriteWorkspace={detail.canWriteWorkspace}
          members={detail.members}
          selfMemberId={detail.selfMember?.id ?? null}
        />
      )
    default:
      return null
  }
}
