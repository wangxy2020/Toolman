import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
  isAssistantLibSession,
  isP2pSharedKnowledgeMirrorDescription,
} from '@toolman/shared'
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
  buildContrastExportContent,
  buildDocumentExportContent,
  hasContrastExportContent,
  hasDocumentExportContent,
} from '../translation/translation-export'
import { isTranslationDocumentPath } from '../translation/translation-document-utils'
import { DEFAULT_TRANSLATION_SECTION } from '../translation/translation-sidebar-types'
import { useI18n } from '../../i18n/useI18n'
import {
  COMMUNITY_SECTION_TO_ACTION,
  type CommunitySidebarSection,
} from '../community/community-sidebar-types'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID,
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
  | 'setActiveView'
  | 'sidebarAssistants'
  | 'chat'
  | 'handleDeleteAssistant'
  | 'setShowAssistants'
  | 'knowledge'
  | 'knowledgeSection'
  | 'setKnowledgeSection'
  | 'setShowKnowledgeCreate'
  | 'notes'
  | 'setNotesIngestTarget'
  | 'setStatusMessage'
  | 'communitySidebarSection'
  | 'setCommunitySidebarSection'
  | 'setCommunityAction'
  | 'p2pWorkspaces'
  | 'registrationGate'
  | 'setShowGroupCreate'
  | 'setShowGroupJoin'
  | 'setPendingJoinCancelId'
  | 'setShowGroupJoinPending'
  | 'projectSidebarTab'
  | 'setProjectSidebarTab'
  | 'translationSection'
  | 'setTranslationSection'
  | 'setTranslationWorkspaceKey'
  | 'translation'
>

export function ChatPageSidebars({
  showContentSidebar,
  activeView,
  setActiveView,
  sidebarAssistants,
  chat,
  handleDeleteAssistant,
  setShowAssistants,
  knowledge,
  knowledgeSection,
  setKnowledgeSection,
  setShowKnowledgeCreate,
  notes,
  setNotesIngestTarget,
  setStatusMessage,
  communitySidebarSection,
  setCommunitySidebarSection,
  setCommunityAction,
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
  setTranslationWorkspaceKey,
  translation,
}: ChatPageSidebarsProps) {
  const { t } = useI18n()

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
        onSelectDefaultSyncFolder={() => {
          knowledge.setActiveId(DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID)
          setKnowledgeSection('sync')
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
          } else if (section === 'sync') {
            knowledge.setActiveId(DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID)
          } else if (section === 'shared') {
            const firstSaved = knowledge.items.find(
              (item) =>
                item.kind === 'shared' &&
                !isP2pSharedKnowledgeMirrorDescription(item.description) &&
                item.documentCount > 0,
            )
            if (firstSaved) {
              knowledge.setActiveId(firstSaved.id)
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
              knowledge.activeId === DEFAULT_SYNC_KNOWLEDGE_FOLDER_ID ||
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
        onSelectContrast={(contrastId) => {
          translation.selectContrast(contrastId)
          setTranslationSection(DEFAULT_TRANSLATION_SECTION)
          setTranslationWorkspaceKey((value) => value + 1)
        }}
        onSelectDocument={(documentId) => {
          translation.selectDocument(documentId)
          setTranslationSection('documents')
          setTranslationWorkspaceKey((value) => value + 1)
        }}
        onStartRenameContrast={translation.startRenameContrast}
        onStartRenameDocument={translation.startRenameDocument}
        onRenameContrast={translation.renameContrast}
        onRenameDocument={translation.renameDocument}
        onCancelRenameContrast={translation.cancelRenameContrast}
        onCancelRenameDocument={translation.cancelRenameDocument}
        onDeleteContrast={(contrastId) => {
          translation.deleteContrast(contrastId)
          setTranslationWorkspaceKey((value) => value + 1)
        }}
        onDeleteDocument={(documentId) => {
          translation.deleteDocument(documentId)
          setTranslationWorkspaceKey((value) => value + 1)
        }}
        onAddContrastToNotes={(contrast) => {
          if (!hasContrastExportContent(contrast)) {
            setStatusMessage(t('translationPage.sidebar.exportEmpty'))
            return
          }
          const title = contrast.title || t('translationPage.sidebar.untitledContrast')
          notes.createNoteFromMessage(title, buildContrastExportContent(contrast))
          setActiveView('notes')
          setStatusMessage(t('translationPage.sidebar.addedToNotes', { title }))
        }}
        onAddDocumentToNotes={(document) => {
          if (!hasDocumentExportContent(document)) {
            setStatusMessage(t('translationPage.sidebar.exportEmpty'))
            return
          }
          const title = document.title || document.fileName
          notes.createNoteFromMessage(title, buildDocumentExportContent(document))
          setActiveView('notes')
          setStatusMessage(t('translationPage.sidebar.addedToNotes', { title }))
        }}
        onAddContrastToKnowledge={(contrast) => {
          if (!hasContrastExportContent(contrast)) {
            setStatusMessage(t('translationPage.sidebar.exportEmpty'))
            return
          }
          const title = contrast.title || t('translationPage.sidebar.untitledContrast')
          const noteId = notes.createNoteFromMessage(title, buildContrastExportContent(contrast))
          setNotesIngestTarget({ noteIds: [noteId], noteTitle: title })
        }}
        onAddDocumentToKnowledge={(document) => {
          if (!hasDocumentExportContent(document)) {
            setStatusMessage(t('translationPage.sidebar.exportEmpty'))
            return
          }
          const title = document.title || document.fileName
          const noteId = notes.createNoteFromMessage(title, buildDocumentExportContent(document))
          setNotesIngestTarget({ noteIds: [noteId], noteTitle: title })
        }}
        onCreateContrast={() => {
          translation.createNewContrast()
          setTranslationSection(DEFAULT_TRANSLATION_SECTION)
          setTranslationWorkspaceKey((value) => value + 1)
        }}
        onOpenDocument={() => {
          setTranslationSection('documents')
          void (async () => {
            const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
              multiple: false,
            })
            if (!result.ok) return
            const { paths } = DialogSelectFilesOutputSchema.parse(result.data)
            const filePath = paths[0]
            if (!filePath || !isTranslationDocumentPath(filePath)) return
            translation.openDocument(filePath)
            setTranslationWorkspaceKey((value) => value + 1)
          })()
        }}
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
    const learningSessions = chat.sessions
      .filter((session) => isAssistantLibSession(session.metadata))
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const workspaceId =
      chat.activeSession?.workspaceId ?? learningSessions[0]?.workspaceId ?? null
    return (
      <AssistantLibSidebar
        workspaceId={workspaceId}
        sessions={learningSessions}
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
