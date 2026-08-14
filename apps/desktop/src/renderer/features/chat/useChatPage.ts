import { useEffect, useRef } from 'react'
import { useChat } from './useChat'
import { useMessageSettings } from './useMessageSettings'
import { useSystemPaths } from './useSystemPaths'
import { isModuleView } from '../../types/app-view'
import { useCommunityUser } from '../community/useCommunityUser'
import { useP2pWorkspaces } from '../group/useP2pWorkspaces'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { useKnowledgeBases } from '../knowledge/useKnowledgeBases'
import { useKnowledgeDefaultFolder } from '../knowledge/useKnowledgeDefaultFolder'
import { useNotes } from '../notes/useNotes'
import { useTranslationRecords } from '../translation/useTranslationRecords'
import { DEFAULT_TRANSLATION_SECTION } from '../translation/translation-sidebar-types'
import { useI18n } from '../../i18n/useI18n'
import type { ChatPageProps } from './chat-page-types'
import { useChatPageNavigation } from './useChatPageNavigation'
import { useChatPageModals } from './useChatPageModals'
import { useChatPageCrossModule } from './useChatPageCrossModule'

export function useChatPage({ appSettings, updateAppSettings }: ChatPageProps) {
  const { t } = useI18n()
  const communityUser = useCommunityUser()
  const registrationGate = useRegistrationGate()
  const notes = useNotes()
  const navigation = useChatPageNavigation(appSettings, notes, communityUser, t)
  const modals = useChatPageModals(navigation.activeView)

  const chat = useChat(navigation.workspaceId, appSettings)
  const { settings: messageSettings, updateSettings: updateMessageSettings, resetSettings } =
    useMessageSettings()
  const systemPaths = useSystemPaths()

  const knowledge = useKnowledgeBases({ workspaceId: navigation.workspaceId })
  const p2pWorkspaces = useP2pWorkspaces({ enabled: registrationGate.canUseGroup })
  const knowledgeFolder = useKnowledgeDefaultFolder(navigation.workspaceId, 'local')
  const networkKnowledgeFolder = useKnowledgeDefaultFolder(navigation.workspaceId, 'network')
  const localFilesFolder = useKnowledgeDefaultFolder(navigation.workspaceId, 'local_files')
  const syncKnowledgeFolder = useKnowledgeDefaultFolder(navigation.workspaceId, 'sync')

  const crossModule = useChatPageCrossModule({
    chat,
    notes,
    p2pWorkspaces,
    systemPaths,
    workspaceId: navigation.workspaceId,
    workspace: navigation.workspace,
    setWorkspace: navigation.setWorkspace,
    setActiveView: navigation.setActiveView,
    messageSettings,
  })

  const translation = useTranslationRecords(
    navigation.workspaceId,
    t('translationPage.sidebar.untitledContrast'),
    crossModule.translationLanguages,
  )

  const prevActiveViewRef = useRef(navigation.activeView)
  useEffect(() => {
    const previous = prevActiveViewRef.current
    prevActiveViewRef.current = navigation.activeView
    if (navigation.activeView !== 'translate' || previous === 'translate') return

    navigation.setTranslationSection(DEFAULT_TRANSLATION_SECTION)
    translation.enterContrastSection()
    navigation.setTranslationWorkspaceKey((value) => value + 1)
  }, [
    navigation.activeView,
    navigation.setTranslationSection,
    navigation.setTranslationWorkspaceKey,
    translation.enterContrastSection,
  ])

  return {
    t,
    appSettings,
    updateAppSettings,
    ...navigation,
    ...modals,
    workspaceId: navigation.workspaceId,
    workspace: navigation.workspace,
    chat,
    messageSettings,
    updateMessageSettings,
    resetSettings,
    systemPaths,
    ...crossModule,
    knowledge,
    p2pWorkspaces,
    knowledgeFolder,
    networkKnowledgeFolder,
    localFilesFolder,
    syncKnowledgeFolder,
    notes,
    translation,
    registrationGate,
    communityUser,
    isModuleView,
  }
}

export type ChatPageState = ReturnType<typeof useChatPage>
