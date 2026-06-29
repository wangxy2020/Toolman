import { GroupMembersMenu } from './GroupMembersMenu'
import { GroupSettingsModal } from './GroupSettingsModal'
import { GroupMemberLimitWarningModal } from './GroupMemberLimitWarningModal'
import { GroupPageStatusBar } from './GroupPageStatusBar'
import { GroupJoinApprovedModal } from './GroupJoinApprovedModal'
import { GroupPageStatusProvider, useClearGroupPanelErrorsOnMemberActivation } from './group-page-status'
import { GroupPageHeader } from './GroupPageHeader'
import { GroupPagePanelContent } from './GroupPagePanelContent'
import type { GroupPageProps } from './group-page-component-types'
import { GROUP_NESTED_SCROLL_ACTIONS } from './group-page-component-types'
import { useGroupPage } from './useGroupPage'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { translateGroupName } from '../../i18n/system-labels'

export type { GroupPageProps } from './group-page-component-types'

function GroupPagePanelErrorReset({ workspaceId }: { workspaceId: string | null }) {
  useClearGroupPanelErrorsOnMemberActivation(workspaceId)
  return null
}

export function GroupPage(props: GroupPageProps) {
  const { onInvite, onUpgradeMembership } = props

  const page = useGroupPage(props)
  const {
    t,
    workspace,
    workspaceName,
    displayWorkspace,
    effectiveAction,
    showSettings,
    setShowSettings,
    membersMenuOpen,
    setMembersMenuOpen,
    membersButtonRef,
    headerActions,
    detail,
    activity,
    syncStatus,
    memberLimitWarning,
    handleWorkspaceUpdated,
    handleWorkspaceLeft,
    handleHeaderActionClick,
    handleOpenSettings,
  } = page

  return (
    <ErrorBoundary title={t('errors.group')}>
      <main className="tm-main">
        <GroupPageHeader
          t={t}
          workspace={workspace}
          displayWorkspace={displayWorkspace}
          effectiveAction={effectiveAction}
          membersMenuOpen={membersMenuOpen}
          membersButtonRef={membersButtonRef}
          headerActions={headerActions}
          handleHeaderActionClick={handleHeaderActionClick}
          handleOpenSettings={handleOpenSettings}
        />

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
          <GroupPagePanelErrorReset workspaceId={workspace?.id ?? null} />
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
              <GroupPagePanelContent
                {...props}
                workspaceName={workspaceName}
                effectiveAction={effectiveAction}
                detail={detail}
                activity={activity}
              />
            )}
          </div>

          {workspace && effectiveAction !== 'messages' ? (
            <GroupPageStatusBar
              syncError={syncStatus.error}
              showSyncIndicator={syncStatus.showSyncIndicator}
              showDegraded={syncStatus.isDegraded && !detail.isOwner && !syncStatus.error}
              isMembershipPending={detail.isMembershipPending}
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
            onWorkspaceLeft={handleWorkspaceLeft}
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

        {detail.joinApprovedNotice ? (
          <GroupJoinApprovedModal
            workspaceName={translateGroupName(detail.joinApprovedNotice.workspaceName, t)}
            onClose={detail.dismissJoinApprovedNotice}
          />
        ) : null}
      </main>
    </ErrorBoundary>
  )
}
