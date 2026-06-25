import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthFeature, Assistant, KnowledgeBase, P2pWorkspace, Session } from '@toolman/shared'
import {
  IconActivity,
  IconAgent,
  IconKnowledge,
  IconMessageBoard,
  IconNotes,
  IconSliders,
  IconUsers,
  IconWorkflow,
} from '../../components/icons'
import { GroupMemberChatPanel } from './GroupMemberChatPanel'
import { GroupMembersMenu } from './GroupMembersMenu'
import { GroupActivityLog } from './GroupActivityLog'
import { GroupKnowledgePanel } from './GroupKnowledgePanel'
import { GroupAgentsPanel } from './GroupAgentsPanel'
import { GroupNotesPanel } from './GroupNotesPanel'
import { GroupWorkflowPanel } from './GroupWorkflowPanel'
import { GroupSettingsModal } from './GroupSettingsModal'
import { GroupMemberLimitWarningModal } from './GroupMemberLimitWarningModal'
import { useGroupMemberLimitWarning } from './useGroupMemberLimitWarning'
import { GroupPageStatusBar } from './GroupPageStatusBar'
import { GroupPageStatusProvider } from './group-page-status'
import { useP2pWorkspace } from './useP2pWorkspace'
import { useP2pEvents } from './useP2pEvents'
import { useP2pSyncStatus } from './useP2pSyncStatus'
import { useGroupWorkspaceBootstrap } from './useGroupWorkspaceBootstrap'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'
import type {
  OpenGroupKnowledgeMarkdownRequest,
  OpenGroupNoteRequest,
  SaveGroupNoteAsCopyRequest,
} from './group-note-open'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'
import type { MessageSettings } from '../chat/message-settings'
import { useAuthSession } from '../user/AuthSessionProvider'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { useI18n } from '../../i18n/useI18n'
import { translateGroupName } from '../../i18n/system-labels'

interface HeaderAction {
  key: string
  icon: React.ReactNode
  title: string
}

const DEFAULT_GROUP_ACTION = 'messages'

const GROUP_NESTED_SCROLL_ACTIONS = new Set([
  'messages',
  'agents',
  'knowledge',
  'notes',
  'workflow',
])

interface Props {
  workspace: P2pWorkspace | null
  sourceWorkspaceId: string | null
  knowledgeBases: KnowledgeBase[]
  assistants: Assistant[]
  sessions: Session[]
  notebooks: NotebookItem[]
  notes: NoteItem[]
  syncFolderPath?: string | null
  onInvite?: () => void
  onWorkspaceUpdated?: (workspace: P2pWorkspace) => void
  onWorkspaceLeft?: () => void
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onKnowledgeBasesChanged?: () => void | Promise<void>
  onSaveGroupNoteAsCopy?: (request: SaveGroupNoteAsCopyRequest) => void | Promise<void>
  onOpenGroupAgentSession?: (request: OpenGroupAgentSessionRequest) => void | Promise<void>
  onReloadAssistants?: () => void | Promise<void>
  onSyncGroupNoteLock?: (noteId: string, locked: boolean) => void
  messageSettings: MessageSettings
  spellCheckEnabled?: boolean
  defaultFilePath?: string | null
  requireRegistration?: (feature: AuthFeature) => boolean
  onUpgradeMembership?: () => void
}

export function GroupPage({
  workspace,
  sourceWorkspaceId,
  knowledgeBases,
  assistants,
  sessions,
  notebooks,
  notes,
  syncFolderPath = null,
  onInvite,
  onWorkspaceUpdated,
  onWorkspaceLeft,
  onOpenNote,
  onOpenGroupNote,
  onOpenGroupKnowledgeMarkdown,
  onKnowledgeBasesChanged,
  onSaveGroupNoteAsCopy,
  onOpenGroupAgentSession,
  onReloadAssistants,
  onSyncGroupNoteLock,
  messageSettings,
  spellCheckEnabled = true,
  defaultFilePath = null,
  requireRegistration,
  onUpgradeMembership,
}: Props) {
  const { t } = useI18n()
  const [activeAction, setActiveAction] = useState<string | null>(DEFAULT_GROUP_ACTION)
  const [showSettings, setShowSettings] = useState(false)
  const [membersMenuOpen, setMembersMenuOpen] = useState(false)
  const membersButtonRef = useRef<HTMLButtonElement>(null)
  const { session } = useAuthSession()
  const headerActions: HeaderAction[] = [
    { key: 'members', icon: <IconUsers size={16} />, title: t('groupPage.header.members') },
    { key: 'messages', icon: <IconMessageBoard size={16} />, title: t('groupPage.header.messages') },
    { key: 'agents', icon: <IconAgent size={16} />, title: t('groupPage.header.agents') },
    { key: 'knowledge', icon: <IconKnowledge size={16} />, title: t('groupPage.header.knowledge') },
    { key: 'notes', icon: <IconNotes size={16} />, title: t('groupPage.header.notes') },
    { key: 'workflow', icon: <IconWorkflow size={16} />, title: t('groupPage.header.workflow') },
    { key: 'activity', icon: <IconActivity size={16} />, title: t('groupPage.header.activity') },
  ]

  const effectiveAction = activeAction ?? DEFAULT_GROUP_ACTION

  const detail = useP2pWorkspace({
    workspaceId: workspace?.id ?? null,
    onWorkspaceInvalid: onWorkspaceLeft,
  })

  const handleWorkspaceUpdated = useCallback(
    (nextWorkspace: P2pWorkspace) => {
      detail.applyWorkspace(nextWorkspace)
      onWorkspaceUpdated?.(nextWorkspace)
    },
    [detail.applyWorkspace, onWorkspaceUpdated],
  )

  const activity = useP2pEvents({ workspaceId: workspace?.id ?? null })
  const syncStatus = useP2pSyncStatus(workspace?.id ?? null)
  useGroupWorkspaceBootstrap(workspace?.id ?? null)

  useEffect(() => {
    if (
      effectiveAction === 'messages' ||
      effectiveAction === 'knowledge' ||
      effectiveAction === 'agents' ||
      effectiveAction === 'notes'
    ) {
      void detail.load()
    }
    if (effectiveAction === 'activity') {
      void activity.load()
    }
  }, [effectiveAction, detail.load, activity.load])

  useEffect(() => {
    setActiveAction(DEFAULT_GROUP_ACTION)
    setShowSettings(false)
    setMembersMenuOpen(false)
  }, [workspace?.id])

  const displayWorkspace = detail.workspace ?? workspace
  const workspaceName = translateGroupName(
    displayWorkspace?.name ?? workspace?.name ?? t('groupPage.title'),
    t,
  )
  const memberLimitWarning = useGroupMemberLimitWarning({
    workspace: displayWorkspace,
    memberCount: displayWorkspace?.memberCount ?? detail.members.length,
    session,
  })

  const guardGroupAccess = () => {
    if (!requireRegistration) return true
    return requireRegistration('group')
  }

  const renderPanel = () => {
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
            selfMemberId={detail.selfMember?.id ?? null}
            selfMemberRole={detail.selfMember?.role ?? null}
            onOpenGroupNote={onOpenGroupNote}
            onSaveGroupNoteAsCopy={onSaveGroupNoteAsCopy}
            onSyncGroupNoteLock={onSyncGroupNoteLock}
          />
        )
      case 'workflow':
        return <GroupWorkflowPanel workspaceName={workspaceName} />
      default:
        return null
    }
  }

  return (
    <ErrorBoundary title={t('errors.group')}>
    <main className="tm-main">
      <header className="tm-chat-header">
        <div className="tm-chat-breadcrumb">
          <span className="tm-model-pill tm-module-pill">{t('groupPage.title')}</span>
          <span className="tm-module-breadcrumb-group">
            <span className="tm-chat-breadcrumb-sep">/</span>
            <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">
              {translateGroupName(displayWorkspace?.name ?? t('groupPage.selectGroup'), t)}
            </span>
          </span>
        </div>

        <div className="tm-chat-header-end">
          {headerActions.map((action) => {
            const isMembersMenu = action.key === 'members'
            const isActive = isMembersMenu
              ? membersMenuOpen
              : effectiveAction === action.key

            return (
              <button
                key={action.key}
                ref={isMembersMenu ? membersButtonRef : undefined}
                type="button"
                className={[
                  'tm-chat-header-settings-btn',
                  isActive ? 'tm-chat-header-settings-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={action.title}
                aria-label={action.title}
                aria-pressed={isActive}
                aria-expanded={isMembersMenu ? membersMenuOpen : undefined}
                onClick={() => {
                  if (!guardGroupAccess()) return
                  if (!workspace) return
                  if (isMembersMenu) {
                    setMembersMenuOpen((current) => !current)
                    return
                  }
                  setMembersMenuOpen(false)
                  setActiveAction((prev) => (prev === action.key ? null : action.key))
                }}
              >
                {action.icon}
              </button>
            )
          })}

          <button
            type="button"
            className="tm-chat-header-settings-btn"
            title={t('groupPage.settingsTitle')}
            aria-label={t('groupPage.settingsTitle')}
            disabled={!workspace}
            onClick={() => {
              if (!guardGroupAccess()) return
              if (!workspace) return
              setShowSettings(true)
            }}
          >
            <IconSliders size={16} />
          </button>
        </div>
      </header>

      {workspace ? (
        <GroupMembersMenu
          open={membersMenuOpen}
          anchorRef={membersButtonRef}
          workspaceName={workspaceName}
          members={detail.members}
          selfMemberId={detail.selfMember?.id ?? null}
          selfMemberRole={detail.selfMember?.role ?? null}
          canManageMembers={detail.canManageMembers}
          loading={detail.loading}
          onClose={() => setMembersMenuOpen(false)}
          onInvite={onInvite}
          onRemoveMember={detail.removeMember}
          onUpdateMemberRole={detail.updateMemberRole}
        />
      ) : null}

      <GroupPageStatusProvider>
        <div
          className={[
            'tm-module-content',
            GROUP_NESTED_SCROLL_ACTIONS.has(effectiveAction) ? 'tm-module-content--chat' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!workspace ? (
            <div className="tm-module-empty">
              <h2 className="tm-module-empty-title">{t('groupPage.emptyTitle')}</h2>
              <p className="tm-module-empty-hint">{t('groupPage.emptyHint')}</p>
            </div>
          ) : (
            renderPanel()
          )}
        </div>

        {workspace && effectiveAction !== 'messages' ? (
          <GroupPageStatusBar
            syncError={syncStatus.error}
            showSyncIndicator={syncStatus.showSyncIndicator}
            showDegraded={syncStatus.isDegraded && !detail.isOwner && !syncStatus.error}
            lastSyncAt={syncStatus.lastSyncAt}
          />
        ) : null}
      </GroupPageStatusProvider>

      {showSettings && workspace && displayWorkspace ? (
        <GroupSettingsModal
          workspace={displayWorkspace}
          workspaceName={workspaceName}
          isOwner={detail.isOwner}
          syncStatus={{
            status: syncStatus.status,
            error: syncStatus.error,
            sequencingMode: syncStatus.sequencingMode,
            ownerOnline: syncStatus.ownerOnline,
            replicationTopology: syncStatus.replicationTopology,
            meshPeersConnected: syncStatus.meshPeersConnected,
            lastEventSeq: syncStatus.lastEventSeq,
            lastSyncAt: syncStatus.lastSyncAt,
            peers: syncStatus.peers,
            pendingFiles: syncStatus.pendingFiles,
            onRefresh: () => void syncStatus.refresh(),
          }}
          onClose={() => setShowSettings(false)}
          onWorkspaceUpdated={handleWorkspaceUpdated}
          onWorkspaceLeft={() => {
            setShowSettings(false)
            onWorkspaceLeft?.()
          }}
        />
      ) : null}

      {displayWorkspace ? (
        <GroupMemberLimitWarningModal
          open={memberLimitWarning.open}
          activeCount={displayWorkspace.memberCount}
          maxMembers={displayWorkspace.maxMembers}
          onClose={memberLimitWarning.dismiss}
          onUpgrade={onUpgradeMembership}
        />
      ) : null}
    </main>
    </ErrorBoundary>
  )
}
