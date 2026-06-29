import { useCallback, useState } from 'react'
import { IpcChannel, type P2pWorkspace, type Workspace } from '@toolman/shared'
import { getWorkspaceFolderPath } from './workspace-utils'
import type { CodeEditorId } from './code-editor-options'
import type {
  OpenGroupKnowledgeMarkdownRequest,
  OpenGroupNoteRequest,
  SaveGroupNoteAsCopyRequest,
} from '../group/group-note-open'
import type { OpenGroupAgentSessionRequest } from '../group/group-agent-open'
import type { AppView } from '../../types/app-view'
import type { KnowledgeFilePanelItem } from '../knowledge/KnowledgeBaseFilePanel'
import type { PendingAttachment } from './chat-attachments'
import { buildChatWithNoteDraft } from '../notes/notes-chat-draft'
import type { useChat } from './useChat'
import type { useNotes } from '../notes/useNotes'
import type { useP2pWorkspaces } from '../group/useP2pWorkspaces'
import type { useSystemPaths } from './useSystemPaths'
import {
  openGroupAgentSession,
  stageKnowledgeFilesForChat,
  updateWorkspaceSettings,
} from './chat-page-handlers'

type ChatApi = ReturnType<typeof useChat>
type NotesApi = ReturnType<typeof useNotes>
type P2pWorkspacesApi = ReturnType<typeof useP2pWorkspaces>
type SystemPathsApi = ReturnType<typeof useSystemPaths>

export function useChatPageInterop(deps: {
  chat: ChatApi
  notes: NotesApi
  p2pWorkspaces: P2pWorkspacesApi
  systemPaths: SystemPathsApi
  workspaceId: string | null
  workspace: Workspace | null
  setWorkspace: (workspace: Workspace) => void
  setActiveView: (view: AppView) => void
  activeAssistantId?: string
}) {
  const {
    chat,
    notes,
    p2pWorkspaces,
    systemPaths,
    workspaceId,
    workspace,
    setWorkspace,
    setActiveView,
    activeAssistantId,
  } = deps

  const [agentPrefillText, setAgentPrefillText] = useState<string | null>(null)
  const [agentPrefillAttachments, setAgentPrefillAttachments] = useState<
    PendingAttachment[] | null
  >(null)
  const [chatPrefillRevision, setChatPrefillRevision] = useState(0)

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

    const updateResult = await updateWorkspaceSettings(workspaceId, { folderPath: path })
    if (!updateResult.ok) {
      chat.setError(updateResult.error)
      return
    }
    setWorkspace(updateResult.workspace)
  }, [workspace, workspaceId, systemPaths, chat, setWorkspace])

  const handleCodeEditorChange = useCallback(
    async (editorId: CodeEditorId) => {
      if (!workspaceId) return
      const updateResult = await updateWorkspaceSettings(workspaceId, { codeEditor: editorId })
      if (!updateResult.ok) {
        chat.setError(updateResult.error)
        return
      }
      setWorkspace(updateResult.workspace)
    },
    [workspaceId, chat, setWorkspace],
  )

  const handleP2pWorkspaceUpdated = useCallback(
    (updated: P2pWorkspace) => {
      p2pWorkspaces.updateWorkspace(updated)
    },
    [p2pWorkspaces.updateWorkspace],
  )

  const handleP2pWorkspaceLeft = useCallback(() => {
    if (p2pWorkspaces.activeId) {
      p2pWorkspaces.removeWorkspace(p2pWorkspaces.activeId)
    }
    void p2pWorkspaces.load()
    void Promise.all([chat.loadAssistants(), chat.loadSessions()])
    setActiveView('agent')
  }, [
    chat.loadAssistants,
    chat.loadSessions,
    p2pWorkspaces.activeId,
    p2pWorkspaces.load,
    p2pWorkspaces.removeWorkspace,
    setActiveView,
  ])

  const handlePrefillConsumed = useCallback(() => {
    setAgentPrefillText(null)
    setAgentPrefillAttachments(null)
  }, [])

  const handleEditUserMessage = useCallback(
    (messageId: string) => {
      const prefill = chat.beginEditUserMessage(messageId)
      if (!prefill) return
      setAgentPrefillText(prefill.text)
      setAgentPrefillAttachments(prefill.attachments.length > 0 ? prefill.attachments : null)
      setChatPrefillRevision((value) => value + 1)
    },
    [chat.beginEditUserMessage],
  )

  const handleChatWithNote = useCallback(
    (noteId: string) => {
      const note = notes.notes.find((item) => item.id === noteId)
      if (!note) return
      setAgentPrefillAttachments(null)
      setAgentPrefillText(buildChatWithNoteDraft(note))
      setChatPrefillRevision((value) => value + 1)
      setActiveView('agent')
      if (!chat.activeSessionId) {
        void chat.createSession(activeAssistantId)
      }
    },
    [activeAssistantId, chat, notes.notes, setActiveView],
  )

  const handleChatWithKnowledgeFiles = useCallback(
    async (items: KnowledgeFilePanelItem[]) => {
      try {
        const result = await stageKnowledgeFilesForChat(items)
        if ('error' in result) {
          chat.setError(result.error)
          return
        }

        setAgentPrefillAttachments(result.attachments)
        setAgentPrefillText(result.draftText)
        setChatPrefillRevision((value) => value + 1)
        setActiveView('agent')
        if (!chat.activeSessionId) {
          void chat.createSession(activeAssistantId)
        }
      } catch (error) {
        chat.setError(error instanceof Error ? error.message : '准备知识库附件失败')
      }
    },
    [activeAssistantId, chat, setActiveView],
  )

  const handleOpenNote = useCallback(
    (noteId: string) => {
      const exists = notes.notes.some((item) => item.id === noteId)
      if (!exists) return false
      setActiveView('notes')
      notes.selectNote(noteId)
      return true
    },
    [notes, setActiveView],
  )

  const handleOpenGroupNote = useCallback(
    async (request: OpenGroupNoteRequest) => {
      const ok = await notes.openGroupSharedNote(request)
      if (!ok) return
      setActiveView('notes')
    },
    [notes, setActiveView],
  )

  const handleSyncGroupNoteLock = useCallback(
    (noteId: string, locked: boolean) => {
      notes.syncGroupNoteLock(noteId, locked)
    },
    [notes],
  )

  const handleReloadAssistants = useCallback(async () => {
    await chat.loadAssistants()
    await chat.loadSessions()
  }, [chat])

  const handleOpenGroupAgentSession = useCallback(
    async (request: OpenGroupAgentSessionRequest) => {
      if (request.isOwner && request.localSessionId) {
        setActiveView('agent')
        await chat.selectSession(request.localSessionId)
        return
      }

      const result = await openGroupAgentSession(request)
      if (!result.ok) {
        chat.setError(result.error)
        return
      }

      await Promise.all([chat.loadAssistants(), chat.loadSessions()])
      setActiveView('agent')
      await chat.selectSession(result.sessionId)
    },
    [chat, setActiveView],
  )

  const handleOpenGroupKnowledgeMarkdown = useCallback(
    async (request: OpenGroupKnowledgeMarkdownRequest) => {
      const ok = await notes.openGroupKnowledgeMarkdown(request)
      if (!ok) return
      setActiveView('notes')
    },
    [notes, setActiveView],
  )

  const handleSaveGroupNoteAsCopy = useCallback(
    async (request: SaveGroupNoteAsCopyRequest) => {
      const noteId = await notes.saveGroupNoteAsCopy(request)
      if (!noteId) return
      setActiveView('notes')
    },
    [notes, setActiveView],
  )

  return {
    agentPrefillText,
    agentPrefillAttachments,
    chatPrefillRevision,
    handleSelectWorkspaceFolder,
    handleCodeEditorChange,
    handleP2pWorkspaceUpdated,
    handleP2pWorkspaceLeft,
    handlePrefillConsumed,
    handleEditUserMessage,
    handleChatWithNote,
    handleChatWithKnowledgeFiles,
    handleOpenNote,
    handleOpenGroupNote,
    handleSyncGroupNoteLock,
    handleReloadAssistants,
    handleOpenGroupAgentSession,
    handleOpenGroupKnowledgeMarkdown,
    handleSaveGroupNoteAsCopy,
  }
}
