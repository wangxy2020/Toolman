import { useEffect, useMemo, useState, useCallback, useRef, type CSSProperties } from 'react'
import { IpcChannel, type Assistant, type P2pWorkspace, type Workspace } from '@toolman/shared'
import { AppNavBar } from '../../components/layout/AppNavBar'
import { MiddleSidebar } from '../../components/layout/MiddleSidebar'
import { ModuleSidebar } from '../../components/layout/ModuleSidebar'
import { GlobalSearchPanel } from '../../components/layout/GlobalSearchPanel'
import { WindowChromeBar } from '../../components/layout/WindowChromeBar'
import { MessagePanel } from './MessagePanel'
import { MessageInput } from './MessageInput'
import { AgentSettingsModal } from './AgentSettingsModal'
import { AssistantSettings } from './AssistantSettings'
import { MessageSettingsPanel } from './MessageSettingsPanel'
import { ChatHeader } from './ChatHeader'
import { useChat } from './useChat'
import { ToolApprovalModal } from './ToolApprovalModal'
import { useMessageSettings } from './useMessageSettings'
import { getWorkspaceFolderPath } from './workspace-utils'
import { useSystemPaths } from './useSystemPaths'
import { messageFontSizePx } from './message-settings'
import type { CodeEditorId } from './code-editor-options'
import { SettingsPage } from '../settings/SettingsPage'
import { useAppSettings } from '../settings/useAppSettings'
import type { SettingsSectionId } from '../settings/settings-nav'
import { ModulePage } from '../modules/ModulePage'
import type {
  OpenGroupKnowledgeMarkdownRequest,
  OpenGroupNoteRequest,
  SaveGroupNoteAsCopyRequest,
} from '../group/group-note-open'
import type { OpenGroupAgentSessionRequest } from '../group/group-agent-open'
import {
  isGroupProxyReadOnlySession,
  isGroupProxySession,
} from '../group/group-agent-utils'
import { isModuleView, type AppView } from '../../types/app-view'
import { GroupSidebar } from '../group/GroupSidebar'
import { GroupPage } from '../group/GroupPage'
import { CommunityPage } from '../community/CommunityPage'
import { CommunitySidebar } from '../community/CommunitySidebar'
import {
  COMMUNITY_SECTION_TO_ACTION,
  DEFAULT_COMMUNITY_SIDEBAR_SECTION,
  type CommunitySidebarSection,
} from '../community/community-sidebar-types'
import { isCommunityModerator } from '../community/community-user-utils'
import { useCommunityUser } from '../community/useCommunityUser'
import { isCommunitySessionActive } from '../user/community-session'
import { GroupCreateModal } from '../group/GroupCreateModal'
import { GroupJoinModal } from '../group/GroupJoinModal'
import { GroupInviteModal } from '../group/GroupInviteModal'
import { useP2pWorkspaces } from '../group/useP2pWorkspaces'
import { useP2pTrustPrompt } from '../group/useP2pTrustPrompt'
import { GroupTrustDeviceModal } from '../group/GroupTrustDeviceModal'
import { useRegistrationGate } from '../user/useRegistrationGate'
import { KnowledgePage } from '../knowledge/KnowledgePage'
import { KnowledgeSidebar } from '../knowledge/KnowledgeSidebar'
import { KnowledgeCreateModal } from '../knowledge/KnowledgeCreateModal'
import { setupKnowledgeBaseAfterCreate } from '../knowledge/knowledge-base-setup'
import { useKnowledgeBases } from '../knowledge/useKnowledgeBases'
import { useKnowledgeDefaultFolder } from '../knowledge/useKnowledgeDefaultFolder'
import { NotesPage } from '../notes/NotesPage'
import { NotesSidebar } from '../notes/NotesSidebar'
import { NotesIngestToKbModal } from '../notes/NotesIngestToKbModal'
import { buildChatWithNoteDraft } from '../notes/notes-chat-draft'
import { buildChatWithKnowledgeFilesDraft } from '../knowledge/knowledge-chat-files'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'
import type { PendingAttachment } from './chat-attachments'
import { useNotes } from '../notes/useNotes'
import { getMessageText } from './message-utils'
import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_LOCAL_FILES_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  FILE_DEDUP_TOOL_ID,
  FILE_REGISTRY_TOOL_ID,
  knowledgeSectionForKind,
  type KnowledgeSidebarSection,
} from '../knowledge/knowledge-sidebar-types'

export function ChatPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [activeView, setActiveView] = useState<AppView>('agent')
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId | undefined>()
  const [showAssistants, setShowAssistants] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [showMessageSettings, setShowMessageSettings] = useState(false)
  const [showAgentSettings, setShowAgentSettings] = useState(false)
  const [showKnowledgeCreate, setShowKnowledgeCreate] = useState(false)
  const [showGroupCreate, setShowGroupCreate] = useState(false)
  const [showGroupJoin, setShowGroupJoin] = useState(false)
  const [showGroupInvite, setShowGroupInvite] = useState(false)
  const [knowledgeSection, setKnowledgeSection] = useState<KnowledgeSidebarSection>('local')
  const [communitySidebarSection, setCommunitySidebarSection] =
    useState<CommunitySidebarSection>(DEFAULT_COMMUNITY_SIDEBAR_SECTION)
  const [communityAction, setCommunityAction] = useState(
    COMMUNITY_SECTION_TO_ACTION[DEFAULT_COMMUNITY_SIDEBAR_SECTION],
  )
  const communityUser = useCommunityUser()
  const registrationGate = useRegistrationGate()
  const [agentPrefillText, setAgentPrefillText] = useState<string | null>(null)
  const [agentPrefillAttachments, setAgentPrefillAttachments] = useState<
    PendingAttachment[] | null
  >(null)
  const [chatPrefillRevision, setChatPrefillRevision] = useState(0)
  const [notesIngestTarget, setNotesIngestTarget] = useState<{
    noteIds?: string[]
    notebookId?: string
    notebookName?: string
    noteTitle?: string
  } | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const knowledge = useKnowledgeBases({ workspaceId })
  const p2pWorkspaces = useP2pWorkspaces({ enabled: registrationGate.canUseGroup })
  const p2pTrust = useP2pTrustPrompt()
  const knowledgeFolder = useKnowledgeDefaultFolder(workspaceId, 'local')
  const networkKnowledgeFolder = useKnowledgeDefaultFolder(workspaceId, 'network')
  const localFilesFolder = useKnowledgeDefaultFolder(workspaceId, 'local_files')
  const notes = useNotes()
  const prevActiveViewRef = useRef(activeView)

  useEffect(() => {
    if (communityAction !== 'management') return
    const canAccessManagement =
      isCommunitySessionActive() && isCommunityModerator(communityUser.profile?.role)
    if (!canAccessManagement) {
      setCommunitySidebarSection(DEFAULT_COMMUNITY_SIDEBAR_SECTION)
      setCommunityAction(COMMUNITY_SECTION_TO_ACTION[DEFAULT_COMMUNITY_SIDEBAR_SECTION])
    }
  }, [communityAction, communityUser.profile?.role])

  const { settings: appSettings, updateSettings: updateAppSettings } = useAppSettings()
  const chat = useChat(workspaceId, appSettings)
  const { settings: messageSettings, updateSettings: updateMessageSettings, resetSettings } =
    useMessageSettings()
  const systemPaths = useSystemPaths()

  const activeAssistant = useMemo(() => {
    const assistantId = chat.activeSession?.assistantId
    if (assistantId) {
      return chat.assistants.find((a) => a.id === assistantId) ?? null
    }
    return chat.assistants.find((a) => a.isPinned) ?? chat.assistants[0] ?? null
  }, [chat.activeSession, chat.assistants])

  const groupProxyMode = useMemo(
    () => isGroupProxySession(chat.activeSession),
    [chat.activeSession],
  )

  const groupProxyReadOnly = useMemo(
    () => isGroupProxyReadOnlySession(chat.activeSession),
    [chat.activeSession],
  )

  const defaultModelId = chat.selectedModelIds[0] ?? activeAssistant?.modelId ?? null

  const translationLanguages = activeAssistant?.parameters.translationLanguages

  useEffect(() => {
    const platform = navigator.platform.toLowerCase()
    if (platform.includes('mac')) {
      document.documentElement.classList.add('platform-darwin')
    } else if (platform.includes('win')) {
      document.documentElement.classList.add('platform-win32')
    } else {
      document.documentElement.classList.add('platform-linux')
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const result = await window.api.invoke(IpcChannel.WorkspaceGetDefault)
      if (result.ok) {
        const ws = result.data as Workspace
        setWorkspaceId(ws.id)
        setWorkspace(ws)
      }
    })()
  }, [])

  const handleModelChange = useCallback(
    (modelIds: string[]) => {
      chat.setSelectedModelIds(modelIds)
      const primaryModelId = modelIds[0]
      if (!activeAssistant || !primaryModelId || activeAssistant.modelId === primaryModelId) {
        return
      }
      void (async () => {
        const result = await window.api.invoke(IpcChannel.AssistantUpdate, {
          id: activeAssistant.id,
          modelId: primaryModelId,
        })
        if (!result.ok) {
          chat.setError(result.error.message)
          return
        }
        await chat.loadAssistants()
      })()
    },
    [activeAssistant, chat],
  )

  useEffect(() => {
    if (!activeAssistant?.modelId) return
    chat.setSelectedModelIds((prev) => {
      if (prev.length === 1 && prev[0] === activeAssistant.modelId) return prev
      return [activeAssistant.modelId]
    })
  }, [activeAssistant?.id, activeAssistant?.modelId, chat.setSelectedModelIds])

  useEffect(() => {
    if (activeView === 'notes' && prevActiveViewRef.current !== 'notes') {
      notes.ensureDefaultSelection()
    }
    prevActiveViewRef.current = activeView
  }, [activeView, notes.ensureDefaultSelection])

  useEffect(() => {
    setShowSearch(false)
  }, [activeView])

  const handleAssistantCreated = useCallback(
    async (assistant: Assistant) => {
      await chat.loadAssistants()
      chat.setSelectedModelIds([assistant.modelId])
      await chat.createSession(assistant.id)
    },
    [chat],
  )

  const handleDeleteAssistant = useCallback(
    async (assistantId: string) => {
      await chat.deleteAssistant(assistantId)
    },
    [chat],
  )

  const handleSelectWorkspaceFolder = useCallback(async () => {
    if (!workspaceId) return

    const defaultPath = getWorkspaceFolderPath(workspace, systemPaths) ?? undefined
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFolder, { defaultPath })
    if (!pickResult.ok) {
      chat.setError(pickResult.error.message)
      return
    }

    const { path } = pickResult.data as { path: string | null }
    if (!path) return

    const updateResult = await window.api.invoke(IpcChannel.WorkspaceUpdate, {
      id: workspaceId,
      settings: { folderPath: path },
    })
    if (!updateResult.ok) {
      chat.setError(updateResult.error.message)
      return
    }
    setWorkspace(updateResult.data as Workspace)
  }, [workspace, workspaceId, systemPaths, chat])

  const handleCodeEditorChange = useCallback(
    async (editorId: CodeEditorId) => {
      if (!workspaceId) return
      const updateResult = await window.api.invoke(IpcChannel.WorkspaceUpdate, {
        id: workspaceId,
        settings: { codeEditor: editorId },
      })
      if (!updateResult.ok) {
        chat.setError(updateResult.error.message)
        return
      }
      setWorkspace(updateResult.data as Workspace)
    },
    [workspaceId, chat],
  )

  const handleP2pWorkspaceUpdated = useCallback(
    (workspace: P2pWorkspace) => {
      p2pWorkspaces.updateWorkspace(workspace)
    },
    [p2pWorkspaces.updateWorkspace],
  )

  const handleP2pWorkspaceLeft = useCallback(() => {
    void p2pWorkspaces.load()
  }, [p2pWorkspaces.load])

  const handleToggleMessageSettings = useCallback(() => {
    setShowMessageSettings((v) => !v)
  }, [])

  const handleOpenSettings = useCallback((section?: SettingsSectionId) => {
    setSettingsSection(section)
    setActiveView('settings')
  }, [])

  const showContentSidebar = activeView !== 'settings' && sidebarVisible
  const isTopNav = appSettings.navBarPosition === 'top'

  const chromeSearchTitle = '全局搜索'

  const handlePrefillConsumed = useCallback(() => {
    setAgentPrefillText(null)
    setAgentPrefillAttachments(null)
  }, [])

  const handleChatWithNote = useCallback(
    (noteId: string) => {
      const note = notes.notes.find((item) => item.id === noteId)
      if (!note) return
      setAgentPrefillAttachments(null)
      setAgentPrefillText(buildChatWithNoteDraft(note))
      setChatPrefillRevision((value) => value + 1)
      setActiveView('agent')
      if (!chat.activeSessionId) {
        void chat.createSession(activeAssistant?.id)
      }
    },
    [activeAssistant?.id, chat, notes.notes],
  )

  const handleChatWithKnowledgeFiles = useCallback(
    async (items: KnowledgeFilePanelItem[]) => {
      const paths = items
        .map((item) => item.absolutePath?.trim())
        .filter((path): path is string => Boolean(path))
      if (paths.length === 0) {
        chat.setError('所选知识库文件没有可用的本地路径')
        return
      }

      try {
        const stageResult = await window.api.invoke(IpcChannel.ChatStageAttachments, {
          paths,
        })
        if (!stageResult.ok) {
          chat.setError(stageResult.error.message)
          return
        }

        const staged = stageResult.data as {
          items: Array<{
            path: string
            name: string
            blobHash: string
            mimeType: string
            kind: 'file' | 'image'
          }>
          errors?: Array<{ path: string; message: string }>
        }

        if (staged.errors?.length) {
          chat.setError(
            staged.errors
              .map((item) => `${item.path.split(/[/\\]/).pop() ?? item.path}：${item.message}`)
              .join('\n'),
          )
        }
        if (staged.items.length === 0) return

        setAgentPrefillAttachments(
          staged.items.map((item) => ({
            path: item.path,
            name: item.name,
            blobHash: item.blobHash,
            mimeType: item.mimeType,
            kind: item.kind,
          })),
        )
        setAgentPrefillText(buildChatWithKnowledgeFilesDraft(items.map((item) => item.title)))
        setChatPrefillRevision((value) => value + 1)
        setActiveView('agent')
        if (!chat.activeSessionId) {
          void chat.createSession(activeAssistant?.id)
        }
      } catch (error) {
        chat.setError(error instanceof Error ? error.message : '准备知识库附件失败')
      }
    },
    [activeAssistant?.id, chat],
  )

  const handleOpenNote = useCallback(
    (noteId: string) => {
      const exists = notes.notes.some((item) => item.id === noteId)
      if (!exists) return false
      setActiveView('notes')
      notes.selectNote(noteId)
      return true
    },
    [notes],
  )

  const handleOpenGroupNote = useCallback(
    async (request: OpenGroupNoteRequest) => {
      const ok = await notes.openGroupSharedNote(request)
      if (!ok) return
      setActiveView('notes')
    },
    [notes],
  )

  const handleOpenGroupAgentSession = useCallback(
    async (request: OpenGroupAgentSessionRequest) => {
      if (request.isOwner && request.localSessionId) {
        setActiveView('agent')
        await chat.selectSession(request.localSessionId)
        return
      }

      const result = await window.api.invoke(IpcChannel.P2pAgentOpenSession, {
        p2pWorkspaceId: request.p2pWorkspaceId,
        resourceId: request.resourceId,
        sourceSessionId: request.sourceSessionId,
        sessionTitle: request.sessionTitle,
        groupName: request.groupName,
        sharedAgentName: request.sharedAgentName,
        permission: request.permission,
        ownerMemberId: request.ownerMemberId,
        sourceAssistantId: request.sourceAssistantId,
        referencedModelId: request.referencedModelId,
      })

      if (!result.ok) {
        chat.setError(result.error.message)
        return
      }

      const data = result.data as { sessionId: string }
      await Promise.all([chat.loadAssistants(), chat.loadSessions()])
      setActiveView('agent')
      await chat.selectSession(data.sessionId)
    },
    [chat],
  )

  const handleOpenGroupKnowledgeMarkdown = useCallback(
    async (request: OpenGroupKnowledgeMarkdownRequest) => {
      const ok = await notes.openGroupKnowledgeMarkdown(request)
      if (!ok) return
      setActiveView('notes')
    },
    [notes],
  )

  const handleSaveGroupNoteAsCopy = useCallback(
    async (request: SaveGroupNoteAsCopyRequest) => {
      const noteId = await notes.saveGroupNoteAsCopy(request)
      if (!noteId) return
      setActiveView('notes')
    },
    [notes],
  )

  const messagePanelStyle: CSSProperties = {
    '--tm-message-font-size': `${messageFontSizePx(messageSettings.messageFontSize)}px`,
  } as CSSProperties

  return (
    <div className="tm-shell">
      {isTopNav ? (
        <AppNavBar
          layout="top"
          activeView={activeView}
          appSettings={appSettings}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
          searchEnabled
          searchTitle={chromeSearchTitle}
          onOpenSearch={() => setShowSearch(true)}
          onNavigate={(view) => {
            if (view === 'agent') setSettingsSection(undefined)
            if (view !== 'settings') setSettingsSection(undefined)
            setActiveView(view)
          }}
          onThemeChange={(theme) => updateAppSettings({ theme })}
        />
      ) : (
        <WindowChromeBar
          sidebarVisible={sidebarVisible}
          onToggleSidebar={() => setSidebarVisible((v) => !v)}
          searchEnabled
          searchTitle={chromeSearchTitle}
          onOpenSearch={() => setShowSearch(true)}
        />
      )}

      <div className="tm-body">
        {!isTopNav && (
          <AppNavBar
            activeView={activeView}
            appSettings={appSettings}
            onNavigate={(view) => {
              if (view === 'agent') setSettingsSection(undefined)
              if (view !== 'settings') setSettingsSection(undefined)
              setActiveView(view)
            }}
            onThemeChange={(theme) => updateAppSettings({ theme })}
          />
        )}

        <div className="tm-body-main">
        {showContentSidebar && activeView === 'agent' && (
          <MiddleSidebar
            assistants={chat.assistants}
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
        )}

        {showContentSidebar && activeView === 'knowledge' && (
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
            onSelectSection={(section) => {
              setKnowledgeSection(section)
              if (section === 'network') {
                knowledge.setActiveId(DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID)
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
        )}

        {showContentSidebar && activeView === 'notes' && (
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
        )}

        {showContentSidebar && activeView === 'community' && (
          <CommunitySidebar
            activeSection={communitySidebarSection}
            onSelectSection={(section) => {
              setCommunitySidebarSection(section)
              setCommunityAction(COMMUNITY_SECTION_TO_ACTION[section])
            }}
          />
        )}

        {showContentSidebar && isModuleView(activeView) && activeView !== 'knowledge' && activeView !== 'notes' && activeView !== 'group' && activeView !== 'community' && (
          <ModuleSidebar view={activeView} />
        )}

        {showContentSidebar && activeView === 'group' && (
          <GroupSidebar
            myGroups={p2pWorkspaces.myGroups}
            joinedGroups={p2pWorkspaces.joinedGroups}
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
          />
        )}

        {activeView === 'agent' ? (
          <main
            className={[
              'tm-main',
              messageSettings.useSerifFont ? 'tm-main--serif' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={messagePanelStyle}
          >
            <ChatHeader
              assistant={activeAssistant}
              workspace={workspace}
              providers={chat.providers}
              selectedModelIds={chat.selectedModelIds}
              onModelChange={handleModelChange}
              onSelectWorkspaceFolder={() => void handleSelectWorkspaceFolder()}
              onCodeEditorChange={(editorId) => void handleCodeEditorChange(editorId)}
              onOpenMessageSettings={handleToggleMessageSettings}
              onOpenAgentSettings={() => setShowAgentSettings(true)}
              messageSettingsOpen={showMessageSettings}
              hasConfiguredProvider={chat.hasConfiguredProvider}
              onOpenSettings={() => handleOpenSettings('model-service')}
              groupProxyMode={groupProxyMode}
            />

            {chat.error && (
              <div className="tm-error-bar">
                {chat.error}
                <button type="button" className="tm-error-dismiss" onClick={() => chat.setError(null)}>
                  ×
                </button>
              </div>
            )}

            {statusMessage ? (
              <div className="tm-status-bar">
                {statusMessage}
                <button
                  type="button"
                  className="tm-error-dismiss"
                  onClick={() => setStatusMessage(null)}
                >
                  ×
                </button>
              </div>
            ) : null}

          <MessagePanel
            messages={chat.messages}
            loading={chat.loading}
            assistantName={activeAssistant?.name ?? '智能体'}
            defaultModelId={defaultModelId}
            translationLanguages={translationLanguages}
            messageSettings={messageSettings}
            sending={chat.sending}
            sendShortcut={messageSettings.sendShortcut}
            pendingMessageAction={chat.pendingMessageAction}
            onDeleteMessage={(id) => void chat.deleteMessage(id)}
            onRegenerateMessage={(id) => void chat.regenerateMessage(id)}
            onForkFromMessage={(id) => void chat.forkFromMessage(id)}
            onSaveToNote={(messageId) => {
              const message = chat.messages.find((item) => item.id === messageId)
              if (!message) return
              const text = getMessageText(message)
              const firstLine = text.split('\n').find((line) => line.trim()) ?? ''
              const title = firstLine.slice(0, 48) || '对话摘录'
              notes.createNoteFromMessage(title, text)
              setActiveView('notes')
            }}
            onError={chat.setError}
          />
          <MessageInput
            disabled={
              !chat.activeSessionId ||
              chat.selectedModelIds.length === 0 ||
              groupProxyReadOnly
            }
            streaming={chat.sending}
            modelCount={chat.selectedModelIds.length}
            defaultModelId={defaultModelId}
            defaultFilePath={systemPaths?.documents ?? systemPaths?.home ?? null}
            translationLanguages={translationLanguages}
            webSearchEnabled={appSettings.webSearchEnabled}
            kbEnabled={appSettings.kbEnabled}
            spellCheckEnabled={appSettings.spellCheckEnabled}
            sendShortcut={messageSettings.sendShortcut}
            onCreateSession={() => void chat.createSession(activeAssistant?.id)}
            onClearSession={() => void chat.clearSessionMessages()}
            prefillText={agentPrefillText}
            prefillAttachments={agentPrefillAttachments}
            prefillRevision={chatPrefillRevision}
            onPrefillConsumed={handlePrefillConsumed}
            onToggleWebSearch={() =>
              updateAppSettings({ webSearchEnabled: !appSettings.webSearchEnabled })
            }
            onToggleKb={() => updateAppSettings({ kbEnabled: !appSettings.kbEnabled })}
            onSend={(contentBlocks) => void chat.sendMessage(contentBlocks)}
            onAbort={() => void chat.abortStreaming()}
            onError={chat.setError}
          />
          </main>
        ) : activeView === 'knowledge' ? (
          <KnowledgePage
            workspaceId={workspaceId}
            section={knowledgeSection}
            activeId={knowledge.activeId}
            active={knowledge.active}
            knowledgeFolderPath={knowledgeFolder.path}
            knowledgeFolderLoading={knowledgeFolder.loading}
            knowledgeFolderError={knowledgeFolder.error}
            networkKnowledgeFolderPath={networkKnowledgeFolder.path}
            networkKnowledgeFolderLoading={networkKnowledgeFolder.loading}
            networkKnowledgeFolderError={networkKnowledgeFolder.error}
            localFilesFolderPath={localFilesFolder.path}
            localFilesFolderLoading={localFilesFolder.loading}
            localFilesFolderError={localFilesFolder.error}
            loading={knowledge.loading}
            error={knowledge.error}
            onKbChanged={() => void knowledge.load()}
            onKnowledgeFolderPathChanged={(path) => void knowledgeFolder.updatePath(path)}
            onKnowledgeFolderError={knowledgeFolder.setError}
            onNetworkKnowledgeFolderPathChanged={(path) => void networkKnowledgeFolder.updatePath(path)}
            onNetworkKnowledgeFolderError={networkKnowledgeFolder.setError}
            onLocalFilesFolderPathChanged={(path) => void localFilesFolder.updatePath(path)}
            onLocalFilesFolderError={localFilesFolder.setError}
            systemPaths={systemPaths}
            onOpenNote={handleOpenNote}
            onChatWithKnowledgeFiles={(items) => void handleChatWithKnowledgeFiles(items)}
          />
        ) : activeView === 'notes' ? (
          <NotesPage
            notebook={notes.activeNotebook}
            note={notes.activeNote}
            notes={notes.notes}
            syncFolderPath={notes.data.syncFolderPath}
            messageSettings={messageSettings}
            onUpdateNote={notes.updateNote}
            onToggleStarred={notes.toggleNoteStarred}
            onToggleLocked={notes.toggleNoteLocked}
            onAddNoteTag={notes.addNoteTag}
            onRemoveNoteTag={notes.removeNoteTag}
            onExportBackup={() => notes.exportNotesBackup()}
            onImportBackup={notes.importNotesBackup}
            onChatWithNote={handleChatWithNote}
            onIngestNote={(noteId, noteTitle) =>
              setNotesIngestTarget({ noteIds: [noteId], noteTitle })
            }
            onSetSyncFolder={notes.setSyncFolder}
            onSelectNote={notes.selectNote}
            onImportAttachment={notes.addNoteAttachment}
          />
        ) : activeView === 'group' ? (
          <>
            <GroupPage
              workspace={p2pWorkspaces.active}
              sourceWorkspaceId={workspaceId}
              knowledgeBases={knowledge.items}
              assistants={chat.assistants}
              sessions={chat.sessions}
              notebooks={notes.data.notebooks}
              notes={notes.notes}
              syncFolderPath={notes.data.syncFolderPath}
              onInvite={
                p2pWorkspaces.active ? () => setShowGroupInvite(true) : undefined
              }
              onWorkspaceUpdated={handleP2pWorkspaceUpdated}
              onWorkspaceLeft={handleP2pWorkspaceLeft}
              onOpenNote={handleOpenNote}
              onOpenGroupNote={handleOpenGroupNote}
              onOpenGroupKnowledgeMarkdown={handleOpenGroupKnowledgeMarkdown}
              onSaveGroupNoteAsCopy={handleSaveGroupNoteAsCopy}
              onOpenGroupAgentSession={handleOpenGroupAgentSession}
              messageSettings={messageSettings}
              spellCheckEnabled={appSettings.spellCheckEnabled}
              defaultFilePath={systemPaths?.documents ?? systemPaths?.home ?? null}
              requireRegistration={registrationGate.requireRegistration}
            />
          </>
        ) : activeView === 'community' ? (
          <CommunityPage
            activeAction={communityAction}
            sidebarSection={communitySidebarSection}
          />
        ) : isModuleView(activeView) ? (
          <ModulePage view={activeView} />
        ) : (
          <SettingsPage
            workspaceId={workspaceId}
            initialSection={settingsSection}
            appSettings={appSettings}
            onAppSettingsChange={updateAppSettings}
            messageSettings={messageSettings}
            onMessageSettingsChange={updateMessageSettings}
            onProvidersSaved={() => void chat.loadProviders()}
          />
        )}

        {activeView === 'agent' && showMessageSettings && (
          <MessageSettingsPanel
            settings={messageSettings}
            onChange={updateMessageSettings}
            onReset={resetSettings}
            onClose={() => setShowMessageSettings(false)}
          />
        )}
        </div>
      </div>

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
            await p2pWorkspaces.join(input)
            setActiveView('group')
          }}
        />
      )}
      {showGroupInvite && p2pWorkspaces.active && (
        <GroupInviteModal
          workspaceId={p2pWorkspaces.active.id}
          workspaceName={p2pWorkspaces.active.name}
          onClose={() => setShowGroupInvite(false)}
        />
      )}
      {p2pTrust.prompt && (
        <GroupTrustDeviceModal
          prompt={p2pTrust.prompt}
          error={p2pTrust.error}
          onTrust={async () => {
            await p2pTrust.respond(true)
          }}
          onReject={async () => {
            await p2pTrust.respond(false)
          }}
        />
      )}
      <ToolApprovalModal />
      {registrationGate.modal}
    </div>
  )
}
