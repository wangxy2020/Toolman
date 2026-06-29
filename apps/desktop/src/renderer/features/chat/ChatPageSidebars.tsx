import { MiddleSidebar } from '../../components/layout/MiddleSidebar'
import { ModuleSidebar } from '../../components/layout/ModuleSidebar'
import { KnowledgeSidebar } from '../knowledge/KnowledgeSidebar'
import { NotesSidebar } from '../notes/NotesSidebar'
import { CommunitySidebar } from '../community/CommunitySidebar'
import { GroupSidebar } from '../group/GroupSidebar'
import { isP2pSharedKnowledgeMirrorDescription } from '@toolman/shared'
import {
  COMMUNITY_SECTION_TO_ACTION,
  type CommunitySidebarSection,
} from '../community/community-sidebar-types'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  knowledgeSectionForKind,
  type KnowledgeSidebarSection,
} from '../knowledge/knowledge-sidebar-types'
import type { ChatPageState } from './useChatPage'

type ChatPageSidebarsProps = Pick<
  ChatPageState,
  | 'showContentSidebar'
  | 'activeView'
  | 'sidebarAssistants'
  | 'chat'
  | 'handleDeleteAssistant'
  | 'setShowAssistants'
  | 'knowledge'
  | 'p2pSharedKnowledge'
  | 'knowledgeSection'
  | 'setKnowledgeSection'
  | 'setShowKnowledgeCreate'
  | 'notes'
  | 'setNotesIngestTarget'
  | 'communitySidebarSection'
  | 'setCommunitySidebarSection'
  | 'setCommunityAction'
  | 'p2pWorkspaces'
  | 'registrationGate'
  | 'setShowGroupCreate'
  | 'setShowGroupJoin'
  | 'setPendingJoinCancelId'
  | 'setShowGroupJoinPending'
>

export function ChatPageSidebars({
  showContentSidebar,
  activeView,
  sidebarAssistants,
  chat,
  handleDeleteAssistant,
  setShowAssistants,
  knowledge,
  p2pSharedKnowledge,
  knowledgeSection,
  setKnowledgeSection,
  setShowKnowledgeCreate,
  notes,
  setNotesIngestTarget,
  communitySidebarSection,
  setCommunitySidebarSection,
  setCommunityAction,
  p2pWorkspaces,
  registrationGate,
  setShowGroupCreate,
  setShowGroupJoin,
  setPendingJoinCancelId,
  setShowGroupJoinPending,
}: ChatPageSidebarsProps) {
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
        sharedKnowledgeEntries={p2pSharedKnowledge.entries}
        activeId={knowledge.activeId}
        activeSection={knowledgeSection}
        loading={knowledge.loading || p2pSharedKnowledge.loading}
        onSelect={(id) => {
          const item = knowledge.items.find((kb) => kb.id === id)
          knowledge.setActiveId(id)
          if (item) {
            setKnowledgeSection(knowledgeSectionForKind(item.kind))
          }
        }}
        onSelectDefaultFolder={() => {
          knowledge.setActiveId(DEFAULT_KNOWLEDGE_FOLDER_ID)
          setKnowledgeSection('local')
        }}
        onSelectDefaultNetworkFolder={() => {
          knowledge.setActiveId(DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID)
          setKnowledgeSection('network')
        }}
        onSelectDefaultLocalFilesFolder={() => {
          knowledge.setActiveId(DEFAULT_LOCAL_FILES_FOLDER_ID)
          setKnowledgeSection('local-files')
        }}
        onSelectFileRegistry={() => {
          knowledge.setActiveId(FILE_REGISTRY_TOOL_ID)
          setKnowledgeSection('file-tools')
        }}
        onSelectFileDedup={() => {
          knowledge.setActiveId(FILE_DEDUP_TOOL_ID)
          setKnowledgeSection('file-tools')
        }}
        onSelectSection={(section: KnowledgeSidebarSection) => {
          setKnowledgeSection(section)
          if (section === 'network') {
            knowledge.setActiveId(DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID)
          } else if (section === 'shared') {
            const firstSaved = knowledge.items.find(
              (item) =>
                item.kind === 'shared' &&
                !isP2pSharedKnowledgeMirrorDescription(item.description) &&
                item.documentCount > 0,
            )
            if (firstSaved) {
              knowledge.setActiveId(firstSaved.id)
            } else if (p2pSharedKnowledge.entries[0]) {
              knowledge.setActiveId(p2pSharedKnowledge.entries[0].id)
            }
          } else if (section === 'local-files') {
            knowledge.setActiveId(DEFAULT_LOCAL_FILES_FOLDER_ID)
          } else if (section === 'file-tools') {
            knowledge.setActiveId(FILE_REGISTRY_TOOL_ID)
          } else if (section === 'local' && !knowledge.activeId) {
            knowledge.setActiveId(DEFAULT_KNOWLEDGE_FOLDER_ID)
          } else if (
            section === 'local' &&
            (knowledge.activeId === DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID ||
              knowledge.activeId === DEFAULT_LOCAL_FILES_FOLDER_ID ||
              knowledge.activeId === FILE_DEDUP_TOOL_ID ||
              knowledge.activeId === FILE_REGISTRY_TOOL_ID)
          ) {
            knowledge.setActiveId(DEFAULT_KNOWLEDGE_FOLDER_ID)
          }
        }}
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
          setNotesIngestTarget({ notebookId, notebookName })
        }
        onIngestNote={(noteId, noteTitle) =>
          setNotesIngestTarget({ noteIds: [noteId], noteTitle })
        }
      />
    )
  }

  if (activeView === 'community') {
    return (
      <CommunitySidebar
        activeSection={communitySidebarSection}
        onSelectSection={(section: CommunitySidebarSection) => {
          setCommunitySidebarSection(section)
          setCommunityAction(COMMUNITY_SECTION_TO_ACTION[section])
        }}
      />
    )
  }

  if (activeView === 'workflow') {
    return <ModuleSidebar view={activeView} />
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
