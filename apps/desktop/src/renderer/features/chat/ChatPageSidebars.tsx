import { MiddleSidebar } from '../../components/layout/MiddleSidebar'
import { ModuleSidebar } from '../../components/layout/ModuleSidebar'
import { KnowledgeSidebar } from '../knowledge/KnowledgeSidebar'
import { NotesSidebar } from '../notes/NotesSidebar'
import { CommunitySidebar } from '../community/CommunitySidebar'
import { GroupSidebar } from '../group/GroupSidebar'
import { ProjectSidebar } from '../project-manager/ProjectSidebar'
import { TranslationSidebar } from '../translation/TranslationSidebar'
import { AssistantLibSidebar } from '../assistant-lib/AssistantLibSidebar'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
} from '../knowledge/knowledge-sidebar-types'
import { useChatPageSidebars, type ChatPageSidebarsProps } from './useChatPageSidebars'

export type { ChatPageSidebarsProps }
export { useChatPageSidebars } from './useChatPageSidebars'

export function ChatPageSidebars(props: ChatPageSidebarsProps) {
  const {
    showContentSidebar,
    activeView,
    sidebarAssistants,
    chat,
    handleDeleteAssistant,
    setShowAssistants,
    knowledge,
    knowledgeSection,
    setShowKnowledgeCreate,
    notes,
    communitySidebarSection,
    p2pWorkspaces,
    registrationGate,
    setShowGroupCreate,
    setShowGroupJoin,
    setPendingJoinCancelId,
    setShowGroupJoinPending,
    projectSidebarTab,
    setProjectSidebarTab,
    translationSection,
    setTranslationSection,
    translation,
  } = props

  const {
    assistantLibSessions,
    assistantLibWorkspaceId,
    handleSelectKnowledge,
    handleSelectKnowledgeSection,
    handleSelectCommunitySection,
    handleSelectContrast,
    handleSelectDocument,
    handleDeleteContrast,
    handleDeleteDocument,
    handleAddContrastToNotes,
    handleAddDocumentToNotes,
    handleAddContrastToKnowledge,
    handleAddDocumentToKnowledge,
    handleCreateContrast,
    handleOpenDocument,
  } = useChatPageSidebars(props)

  if (!showContentSidebar) return null

  if (activeView === 'agent') {
    return (
      <MiddleSidebar
        assistants={sidebarAssistants}
        sessions={chat.sessions}
        activeSessionId={chat.activeSessionId}
        sessionsLoading={chat.sessionsLoading}
        onSelectSession={chat.selectSession}
        onCreateSession={(assistantId) => void chat.createSession(assistantId)}
        onRenameSession={(id, title) => void chat.renameSession(id, title)}
        onDeleteSession={(id) => void chat.deleteSession(id)}
        onDeleteAssistant={(id) => void handleDeleteAssistant(id)}
        onAddAssistant={() => setShowAssistants(true)}
      />
    )
  }

  if (activeView === 'knowledge') {
    return (
      <KnowledgeSidebar
        items={knowledge.items}
        activeId={knowledge.activeId}
        activeSection={knowledgeSection}
        loading={knowledge.loading}
        onSelect={handleSelectKnowledge}
        onSelectDefaultFolder={() => {
          knowledge.setActiveId(DEFAULT_KNOWLEDGE_FOLDER_ID)
          props.setKnowledgeSection('local')
        }}
        onSelectDefaultSyncFolder={() => {
          knowledge.setActiveId(DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID)
          props.setKnowledgeSection('sync')
        }}
        onSelectDefaultNetworkFolder={() => {
          knowledge.setActiveId(DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID)
          props.setKnowledgeSection('network')
        }}
        onSelectDefaultLocalFilesFolder={() => {
          knowledge.setActiveId(DEFAULT_LOCAL_FILES_FOLDER_ID)
          props.setKnowledgeSection('local-files')
        }}
        onSelectFileRegistry={() => {
          knowledge.setActiveId(FILE_REGISTRY_TOOL_ID)
          props.setKnowledgeSection('file-tools')
        }}
        onSelectFileDedup={() => {
          knowledge.setActiveId(FILE_DEDUP_TOOL_ID)
          props.setKnowledgeSection('file-tools')
        }}
        onSelectSection={handleSelectKnowledgeSection}
        onCreate={() => setShowKnowledgeCreate(true)}
        onDelete={(id) => void knowledge.remove(id)}
      />
    )
  }

  if (activeView === 'notes') {
    return (
      <NotesSidebar
        notebooks={notes.notebooks}
        notesByNotebook={notes.notesByNotebook}
        activeNoteId={notes.activeNoteId}
        expandedNotebookIds={notes.expandedNotebookIds}
        searchQuery={notes.searchQuery}
        activeTagFilter={notes.activeTagFilter}
        onSearchQueryChange={notes.setSearchQuery}
        onTagFilterChange={notes.setActiveTagFilter}
        onToggleExpanded={notes.toggleExpanded}
        onCreateNotebook={notes.createNotebook}
        onCreateNote={notes.createNote}
        onSelectNote={notes.selectNote}
        onRenameNotebook={notes.renameNotebook}
        onRenameNote={notes.renameNote}
        onDeleteNotebook={notes.deleteNotebook}
        onDeleteNote={notes.deleteNote}
        onIngestNotebook={(notebookId, notebookName) =>
          props.setNotesIngestTarget({ notebookId, notebookName })
        }
        onIngestNote={(noteId, noteTitle) =>
          props.setNotesIngestTarget({ noteIds: [noteId], noteTitle })
        }
      />
    )
  }

  if (activeView === 'community') {
    return (
      <CommunitySidebar
        activeSection={communitySidebarSection}
        onSelectSection={handleSelectCommunitySection}
      />
    )
  }

  if (activeView === 'translate') {
    return (
      <TranslationSidebar
        activeSection={translationSection}
        onSelectSection={setTranslationSection}
        contrasts={translation.contrasts}
        documents={translation.documents}
        activeContrastId={translation.activeContrastId}
        activeDocumentId={translation.activeDocumentId}
        renameContrastId={translation.renameContrastId}
        renameDocumentId={translation.renameDocumentId}
        onSelectContrast={handleSelectContrast}
        onSelectDocument={handleSelectDocument}
        onStartRenameContrast={translation.startRenameContrast}
        onStartRenameDocument={translation.startRenameDocument}
        onRenameContrast={translation.renameContrast}
        onRenameDocument={translation.renameDocument}
        onCancelRenameContrast={translation.cancelRenameContrast}
        onCancelRenameDocument={translation.cancelRenameDocument}
        onDeleteContrast={handleDeleteContrast}
        onDeleteDocument={handleDeleteDocument}
        onAddContrastToNotes={handleAddContrastToNotes}
        onAddDocumentToNotes={handleAddDocumentToNotes}
        onAddContrastToKnowledge={handleAddContrastToKnowledge}
        onAddDocumentToKnowledge={handleAddDocumentToKnowledge}
        onCreateContrast={handleCreateContrast}
        onOpenDocument={handleOpenDocument}
      />
    )
  }

  if (activeView === 'workflow') {
    return <ModuleSidebar view={activeView} />
  }

  if (activeView === 'projects') {
    return (
      <ProjectSidebar
        activeTab={projectSidebarTab}
        onSelectTab={setProjectSidebarTab}
      />
    )
  }

  if (activeView === 'assistant-lib') {
    return (
      <AssistantLibSidebar
        workspaceId={assistantLibWorkspaceId}
        sessions={assistantLibSessions}
        activeSessionId={chat.activeSessionId}
        onSelectSession={(id) => void chat.selectSession(id)}
      />
    )
  }

  if (activeView === 'group') {
    return (
      <GroupSidebar
        myGroups={p2pWorkspaces.myGroups}
        joinedGroups={p2pWorkspaces.joinedGroups}
        pendingJoinCount={p2pWorkspaces.pendingJoinIds.length}
        activeId={p2pWorkspaces.activeId}
        loading={p2pWorkspaces.loading}
        onSelect={p2pWorkspaces.setActiveId}
        onCreate={() => {
          if (!registrationGate.requireRegistration('group')) return
          setShowGroupCreate(true)
        }}
        onJoin={() => {
          if (!registrationGate.requireRegistration('group')) return
          setShowGroupJoin(true)
        }}
        onShowPendingJoins={() => {
          setPendingJoinCancelId(p2pWorkspaces.pendingJoinIds[0] ?? null)
          setShowGroupJoinPending(true)
        }}
      />
    )
  }

  return null
}
