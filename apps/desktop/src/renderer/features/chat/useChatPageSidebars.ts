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
  buildContrastExportContent,
  buildDocumentExportContent,
  hasContrastExportContent,
  hasDocumentExportContent,
} from '../translation/translation-export'
import { isTranslationDocumentPath } from '../translation/translation-document-utils'
import { DEFAULT_TRANSLATION_SECTION } from '../translation/translation-sidebar-types'
import type { TranslationContrastItem, TranslationDocumentItem } from '../translation/translation-storage'
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

export function useChatPageSidebars({
  knowledge,
  setKnowledgeSection,
  setActiveView,
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

  const handleSelectContrast = useCallback(
    (contrastId: string) => {
      translation.selectContrast(contrastId)
      setTranslationSection(DEFAULT_TRANSLATION_SECTION)
      bumpTranslationWorkspace()
    },
    [bumpTranslationWorkspace, setTranslationSection, translation],
  )

  const handleSelectDocument = useCallback(
    (documentId: string) => {
      translation.selectDocument(documentId)
      setTranslationSection('documents')
      bumpTranslationWorkspace()
    },
    [bumpTranslationWorkspace, setTranslationSection, translation],
  )

  const handleDeleteContrast = useCallback(
    (contrastId: string) => {
      translation.deleteContrast(contrastId)
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

  const handleAddContrastToNotes = useCallback(
    (contrast: TranslationContrastItem) => {
      if (!hasContrastExportContent(contrast)) {
        setStatusMessage(t('translationPage.sidebar.exportEmpty'))
        return
      }
      const title = contrast.title || t('translationPage.sidebar.untitledContrast')
      notes.createNoteFromMessage(title, buildContrastExportContent(contrast))
      setActiveView('notes')
      setStatusMessage(t('translationPage.sidebar.addedToNotes', { title }))
    },
    [notes, setActiveView, setStatusMessage, t],
  )

  const handleAddDocumentToNotes = useCallback(
    (document: TranslationDocumentItem) => {
      if (!hasDocumentExportContent(document)) {
        setStatusMessage(t('translationPage.sidebar.exportEmpty'))
        return
      }
      const title = document.title || document.fileName
      notes.createNoteFromMessage(title, buildDocumentExportContent(document))
      setActiveView('notes')
      setStatusMessage(t('translationPage.sidebar.addedToNotes', { title }))
    },
    [notes, setActiveView, setStatusMessage, t],
  )

  const handleAddContrastToKnowledge = useCallback(
    (contrast: TranslationContrastItem) => {
      if (!hasContrastExportContent(contrast)) {
        setStatusMessage(t('translationPage.sidebar.exportEmpty'))
        return
      }
      const title = contrast.title || t('translationPage.sidebar.untitledContrast')
      const noteId = notes.createNoteFromMessage(title, buildContrastExportContent(contrast))
      setNotesIngestTarget({ noteIds: [noteId], noteTitle: title })
    },
    [notes, setNotesIngestTarget, setStatusMessage, t],
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

  const handleCreateContrast = useCallback(() => {
    translation.createNewContrast()
    setTranslationSection(DEFAULT_TRANSLATION_SECTION)
    bumpTranslationWorkspace()
  }, [bumpTranslationWorkspace, setTranslationSection, translation])

  const handleOpenDocument = useCallback(() => {
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
      bumpTranslationWorkspace()
    })()
  }, [bumpTranslationWorkspace, setTranslationSection, translation])

  return {
    t,
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
  }
}
