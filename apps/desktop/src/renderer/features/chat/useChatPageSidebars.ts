import { useCallback, useMemo } from 'react'
import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { COMMUNITY_SECTION_TO_ACTION, type CommunitySidebarSection } from '../community/community-sidebar-types'
import {
  knowledgeSectionForKind,
  type KnowledgeSidebarSection,
} from '../knowledge/knowledge-sidebar-types'
import {
  buildDocumentExportContent,
  hasDocumentExportContent,
} from '../translation/translation-export'
import { isTranslationDocumentPath } from '../translation/translation-document-utils'
import {
  DEFAULT_TRANSLATION_FOLDER_ID,
  type TranslationDocumentItem,
} from '../translation/translation-storage'
import {
  listAssistantLibSidebarSessions,
  resolveAssistantLibSidebarWorkspaceId,
  resolveKnowledgeActiveIdForSection,
} from './chat-page-sidebars-utils'
import type { ChatPageState } from './useChatPage'

export type ChatPageSidebarsProps = Pick<
  ChatPageState,
  | 'showContentSidebar'
  | 'activeView'
  | 'sidebarAssistants'
  | 'activeAssistant'
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

export function useChatPageSidebars({
  knowledge,
  setKnowledgeSection,
  notes,
  setNotesIngestTarget,
  setStatusMessage,
  setCommunitySidebarSection,
  setCommunityAction,
  setTranslationSection,
  setTranslationWorkspaceKey,
  translation,
  chat,
}: ChatPageSidebarsProps) {
  const { t } = useI18n()

  const assistantLibSessions = useMemo(
    () => listAssistantLibSidebarSessions(chat.sessions),
    [chat.sessions],
  )
  const assistantLibWorkspaceId = resolveAssistantLibSidebarWorkspaceId(
    chat.activeSession?.workspaceId,
    assistantLibSessions,
  )

  const handleSelectKnowledge = useCallback(
    (id: string) => {
      const item = knowledge.items.find((kb) => kb.id === id)
      knowledge.setActiveId(id)
      if (item) {
        setKnowledgeSection(knowledgeSectionForKind(item.kind))
      }
    },
    [knowledge, setKnowledgeSection],
  )

  const handleSelectKnowledgeSection = useCallback(
    (section: KnowledgeSidebarSection) => {
      setKnowledgeSection(section)
      const nextId = resolveKnowledgeActiveIdForSection(section, knowledge.items, knowledge.activeId)
      if (nextId) knowledge.setActiveId(nextId)
    },
    [knowledge, setKnowledgeSection],
  )

  const handleSelectCommunitySection = useCallback(
    (section: CommunitySidebarSection) => {
      setCommunitySidebarSection(section)
      setCommunityAction(COMMUNITY_SECTION_TO_ACTION[section])
    },
    [setCommunityAction, setCommunitySidebarSection],
  )

  const bumpTranslationWorkspace = useCallback(() => {
    setTranslationWorkspaceKey((value) => value + 1)
  }, [setTranslationWorkspaceKey])

  const handleSelectDocument = useCallback(
    (documentId: string) => {
      translation.selectDocument(documentId)
      const document = translation.documents.find((item) => item.id === documentId)
      setTranslationSection(document?.folderId ?? DEFAULT_TRANSLATION_FOLDER_ID)
      bumpTranslationWorkspace()
    },
    [bumpTranslationWorkspace, setTranslationSection, translation],
  )

  const handleCreateFolder = useCallback(() => {
    const folder = translation.createFolder()
    if (!folder) return
    setTranslationSection(folder.id)
    bumpTranslationWorkspace()
  }, [bumpTranslationWorkspace, setTranslationSection, translation])

  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      translation.deleteFolder(folderId)
      bumpTranslationWorkspace()
    },
    [bumpTranslationWorkspace, translation],
  )

  const handleDeleteDocument = useCallback(
    (documentId: string) => {
      translation.deleteDocument(documentId)
      bumpTranslationWorkspace()
    },
    [bumpTranslationWorkspace, translation],
  )

  const handleAddDocumentToKnowledge = useCallback(
    (document: TranslationDocumentItem) => {
      if (!hasDocumentExportContent(document)) {
        setStatusMessage(t('translationPage.sidebar.exportEmpty'))
        return
      }
      const title = document.title || document.fileName
      const noteId = notes.createNoteFromMessage(title, buildDocumentExportContent(document))
      setNotesIngestTarget({ noteIds: [noteId], noteTitle: title })
    },
    [notes, setNotesIngestTarget, setStatusMessage, t],
  )

  const handleOpenDocument = useCallback(
    (folderId: string = DEFAULT_TRANSLATION_FOLDER_ID) => {
      setTranslationSection(folderId)
      void (async () => {
        const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
          multiple: false,
        })
        if (!result.ok) return
        const { paths } = DialogSelectFilesOutputSchema.parse(result.data)
        const filePath = paths[0]
        if (!filePath || !isTranslationDocumentPath(filePath)) return
        translation.openDocument(filePath, folderId)
        bumpTranslationWorkspace()
      })()
    },
    [bumpTranslationWorkspace, setTranslationSection, translation],
  )

  return {
    t,
    assistantLibSessions,
    assistantLibWorkspaceId,
    handleSelectKnowledge,
    handleSelectKnowledgeSection,
    handleSelectCommunitySection,
    handleSelectDocument,
    handleCreateFolder,
    handleDeleteFolder,
    handleDeleteDocument,
    handleAddDocumentToKnowledge,
    handleOpenDocument,
  }
}
