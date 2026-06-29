import { GlobalSearchPanel } from '../../components/layout/GlobalSearchPanel'
import { AgentSettingsModal } from './AgentSettingsModal'
import { AssistantSettings } from './AssistantSettings'
import { ToolApprovalModal } from './ToolApprovalModal'
import { GroupCreateModal } from '../group/GroupCreateModal'
import { GroupJoinModal } from '../group/GroupJoinModal'
import { GroupJoinPendingModal } from '../group/GroupJoinPendingModal'
import { GroupJoinApprovedModal } from '../group/GroupJoinApprovedModal'
import { GroupInviteModal } from '../group/GroupInviteModal'
import { MembershipUpgradeModal } from '../user/MembershipUpgradeModal'
import { KnowledgeCreateModal } from '../knowledge/KnowledgeCreateModal'
import { setupKnowledgeBaseAfterCreate } from '../knowledge/knowledge-base-setup'
import { NotesIngestToKbModal } from '../notes/NotesIngestToKbModal'
import { knowledgeSectionForKind } from '../knowledge/knowledge-sidebar-types'
import type { ChatPageState } from './useChatPage'

type ChatPageModalsProps = Pick<
  ChatPageState,
  | 'showSearch'
  | 'setShowSearch'
  | 'workspaceId'
  | 'chat'
  | 'notes'
  | 'knowledge'
  | 'setActiveView'
  | 'setKnowledgeSection'
  | 'notesIngestTarget'
  | 'setNotesIngestTarget'
  | 'setStatusMessage'
  | 'showAgentSettings'
  | 'setShowAgentSettings'
  | 'activeAssistant'
  | 'workspace'
  | 'showAssistants'
  | 'setShowAssistants'
  | 'handleAssistantCreated'
  | 'showKnowledgeCreate'
  | 'setShowKnowledgeCreate'
  | 'knowledgeFolder'
  | 'networkKnowledgeFolder'
  | 'localFilesFolder'
  | 'showGroupCreate'
  | 'setShowGroupCreate'
  | 'p2pWorkspaces'
  | 'showGroupJoin'
  | 'setShowGroupJoin'
  | 'setPendingJoinCancelId'
  | 'setShowGroupJoinPending'
  | 'showGroupJoinPending'
  | 'pendingJoinCancelId'
  | 'setShowMembershipUpgrade'
  | 'showMembershipUpgrade'
  | 'showGroupInvite'
  | 'setShowGroupInvite'
  | 'registrationGate'
>

export function ChatPageModals({
  showSearch,
  setShowSearch,
  workspaceId,
  chat,
  notes,
  knowledge,
  setActiveView,
  setKnowledgeSection,
  notesIngestTarget,
  setNotesIngestTarget,
  setStatusMessage,
  showAgentSettings,
  setShowAgentSettings,
  activeAssistant,
  workspace,
  showAssistants,
  setShowAssistants,
  handleAssistantCreated,
  showKnowledgeCreate,
  setShowKnowledgeCreate,
  knowledgeFolder,
  networkKnowledgeFolder,
  localFilesFolder,
  showGroupCreate,
  setShowGroupCreate,
  p2pWorkspaces,
  showGroupJoin,
  setShowGroupJoin,
  setPendingJoinCancelId,
  setShowGroupJoinPending,
  showGroupJoinPending,
  pendingJoinCancelId,
  setShowMembershipUpgrade,
  showMembershipUpgrade,
  showGroupInvite,
  setShowGroupInvite,
  registrationGate,
}: ChatPageModalsProps) {
  return (
    <>
      {showSearch ? (
        <GlobalSearchPanel
          workspaceId={workspaceId}
          sessions={chat.sessions}
          notes={notes.notes}
          knowledgeBases={knowledge.items}
          onSelectSession={(id) => {
            setActiveView('agent')
            void chat.selectSession(id)
          }}
          onSelectNote={(id) => {
            setActiveView('notes')
            notes.selectNote(id)
          }}
          onSelectKnowledgeBase={(id) => {
            const item = knowledge.items.find((kb) => kb.id === id)
            setActiveView('knowledge')
            knowledge.setActiveId(id)
            setKnowledgeSection(item ? knowledgeSectionForKind(item.kind) : 'local')
          }}
          onClose={() => setShowSearch(false)}
        />
      ) : null}

      {notesIngestTarget ? (
        <NotesIngestToKbModal
          workspaceId={workspaceId}
          knowledgeBases={knowledge.items}
          noteIds={notesIngestTarget.noteIds}
          notebookId={notesIngestTarget.notebookId}
          notebookName={notesIngestTarget.notebookName}
          noteTitle={notesIngestTarget.noteTitle}
          onClose={() => setNotesIngestTarget(null)}
          onDone={(message) => setStatusMessage(message)}
        />
      ) : null}

      {showAgentSettings && activeAssistant && (
        <AgentSettingsModal
          assistant={activeAssistant}
          workspace={workspace}
          providers={chat.providers}
          activeSession={chat.activeSession}
          onClose={() => setShowAgentSettings(false)}
          onSaved={() => void chat.loadAssistants()}
        />
      )}

      {showAssistants && workspaceId && (
        <AssistantSettings
          workspaceId={workspaceId}
          workspace={workspace}
          providers={chat.providers}
          onClose={() => setShowAssistants(false)}
          onSaved={(assistant) => void handleAssistantCreated(assistant)}
        />
      )}

      {showKnowledgeCreate && (
        <KnowledgeCreateModal
          defaultLocalFolderPath={knowledgeFolder.path}
          defaultNetworkFolderPath={networkKnowledgeFolder.path}
          defaultLocalFilesFolderPath={localFilesFolder.path}
          onClose={() => setShowKnowledgeCreate(false)}
          onSubmit={async (input) => {
            if (!workspaceId) return

            const kb = await knowledge.create({
              name: input.name,
              description: input.description,
              kind: input.kind,
            })
            if (!kb) return

            const warning = await setupKnowledgeBaseAfterCreate(workspaceId, kb, input)
            setKnowledgeSection(knowledgeSectionForKind(input.kind))
            knowledge.setActiveId(kb.id)
            await knowledge.load()
            if (warning) knowledge.setError(warning)
          }}
        />
      )}

      {showGroupCreate && (
        <GroupCreateModal
          onClose={() => setShowGroupCreate(false)}
          onSubmit={async (input) => {
            await p2pWorkspaces.create(input)
            setActiveView('group')
          }}
        />
      )}

      {showGroupJoin && (
        <GroupJoinModal
          onClose={() => setShowGroupJoin(false)}
          onSubmit={async (input) => {
            const result = await p2pWorkspaces.join(input)
            if (result.isPending) {
              setPendingJoinCancelId(result.workspace.id)
              setShowGroupJoinPending(true)
              return
            }
            setActiveView('group')
          }}
          onUpgradeMembership={() => setShowMembershipUpgrade(true)}
        />
      )}

      {showGroupJoinPending ? (
        <GroupJoinPendingModal
          onClose={() => {
            setShowGroupJoinPending(false)
            setPendingJoinCancelId(null)
          }}
          onCancelRequest={async () => {
            const cancelId =
              pendingJoinCancelId ?? p2pWorkspaces.pendingJoinIds[0] ?? null
            if (!cancelId) return
            await p2pWorkspaces.cancelPendingJoin(cancelId)
            setShowGroupJoinPending(false)
            setPendingJoinCancelId(null)
          }}
        />
      ) : null}

      {p2pWorkspaces.joinApprovedNotice ? (
        <GroupJoinApprovedModal
          workspaceName={p2pWorkspaces.joinApprovedNotice.workspaceName}
          onClose={() => {
            p2pWorkspaces.dismissJoinApprovedNotice()
            setActiveView('group')
          }}
        />
      ) : null}

      <MembershipUpgradeModal
        open={showMembershipUpgrade}
        onClose={() => setShowMembershipUpgrade(false)}
      />

      {showGroupInvite && p2pWorkspaces.active && (
        <GroupInviteModal
          workspaceId={p2pWorkspaces.active.id}
          workspaceName={p2pWorkspaces.active.name}
          onClose={() => setShowGroupInvite(false)}
        />
      )}

      <ToolApprovalModal />
      {registrationGate.modal}
    </>
  )
}
