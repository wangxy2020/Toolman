import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupAgentPickerModal } from './GroupAgentPickerModal'
import { GroupAgentSessionActionMenu } from './GroupAgentSessionActionMenu'
import { GroupFileContextMenu } from './GroupFileContextMenu'
import { GroupMemberResourceSection } from './GroupMemberResourceSection'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupSharedAgentSection } from './GroupSharedAgentSection'
import type { GroupAgentsPanelProps } from './group-agents-panel-types'
import { useGroupAgentsPanel } from './useGroupAgentsPanel'

export type { GroupAgentsPanelProps } from './group-agents-panel-types'

export function GroupAgentsPanel(props: GroupAgentsPanelProps) {
  const { sessions } = props
  const panel = useGroupAgentsPanel(props)
  const {
    t,
    workspaceName,
    sourceWorkspaceId,
    selfMemberId,
    canWriteWorkspace,
    p2pAgents,
    showPicker,
    setShowPicker,
    openingPicker,
    selectedKeys,
    removingResourceId,
    removingSessionId,
    pendingDelete,
    setPendingDelete,
    contextMenu,
    setContextMenu,
    sessionActionMenu,
    setSessionActionMenu,
    handleRefresh,
    hasShareableAgents,
    addAgentsDisabledReason,
    memberSections,
    resolveResourceAssistant,
    canDeleteResource,
    canManagePermission,
    canManageAgents,
    handleToggleSelect,
    handleToggleSelectSection,
    handleSectionKeysChange,
    requestRemoveAgent,
    handleRemoveSession,
    confirmDelete,
    handleSelectAll,
    handleClearSelection,
    handleDeleteSelected,
    handleContextMenu,
    handleAddAgents,
    handleOpenPicker,
    handleSessionAction,
    buildOpenSessionRequest,
    resolveSessionPermission,
    onOpenGroupAgentSession,
    shareableAssistants,
  } = panel

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title={t('groupPage.header.agents')}
        subtitle={`${workspaceName} · ${t('groupPage.panels.count', {
          count: p2pAgents.sharedResources.length,
          type: t('groupPage.panels.types.agents'),
        })}`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pAgents.loading}
            onRefresh={() => void handleRefresh()}
          />
        }
      />

      <div className="tm-kb-file-panel" onContextMenu={handleContextMenu}>
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={
            openingPicker ||
            p2pAgents.sharing ||
            !canWriteWorkspace ||
            !sourceWorkspaceId ||
            !hasShareableAgents
          }
          onClick={handleOpenPicker}
        >
          <span className="tm-kb-file-dropzone-title">
            {openingPicker || p2pAgents.sharing
              ? t('groupPage.panels.adding', { type: t('groupPage.panels.types.agents') })
              : t('groupPage.panels.clickAdd', { type: t('groupPage.panels.types.agents') })}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {addAgentsDisabledReason === 'noAgents'
              ? t('groupPage.panels.addDisabledNoAgents')
              : addAgentsDisabledReason === 'allShared'
                ? t('groupPage.panels.addDisabledAllShared')
                : addAgentsDisabledReason === 'readonly'
                  ? t('groupPage.panels.addDisabledReadonly')
                  : t('groupPage.panels.pickHint', { type: t('groupPage.panels.types.agents') })}
          </span>
          {addAgentsDisabledReason === 'noAgents' ? (
            <span className="tm-kb-file-dropzone-hint">
              {t('groupPage.panels.sharePermissionHint')}
            </span>
          ) : null}
        </button>

        {p2pAgents.loading && p2pAgents.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.loading', { type: t('groupPage.panels.types.agents') })}</p>
          </div>
        ) : p2pAgents.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.empty', { type: t('groupPage.panels.types.agents') })}</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {memberSections.map((memberSection) => (
              <GroupMemberResourceSection
                key={memberSection.memberId}
                displayName={memberSection.displayName}
                isSelf={memberSection.isSelf}
                resourceCount={memberSection.resources.length}
                selfLabel={t('groupPage.panels.memberSelf')}
              >
                {memberSection.resources.map((resource) => {
                  const assistant = resolveResourceAssistant(resource)
                  return (
                    <GroupSharedAgentSection
                      key={resource.id}
                      resource={resource}
                      workspaceName={workspaceName}
                      assistant={assistant}
                      isSharer={selfMemberId != null && resource.sharedBy === selfMemberId}
                      sessions={sessions}
                      selectedKeys={selectedKeys}
                      canDelete={canDeleteResource(resource)}
                      removingResourceId={removingResourceId}
                      removingSessionId={removingSessionId}
                      onToggleSelect={handleToggleSelect}
                      onToggleSelectSection={handleToggleSelectSection}
                      onRemoveAgent={() => requestRemoveAgent(resource.id)}
                      onRemoveSession={(sessionId) => handleRemoveSession(resource.id, sessionId)}
                      onOpenSession={onOpenGroupAgentSession}
                      buildOpenSessionRequest={(session) =>
                        buildOpenSessionRequest(resource, assistant, session)
                      }
                      onOpenSessionMenu={(currentResource, sessionId, anchor) =>
                        setSessionActionMenu({
                          resource: currentResource,
                          sessionId,
                          ...anchor,
                        })
                      }
                      onContextMenu={handleContextMenu}
                      onSectionKeysChange={handleSectionKeysChange}
                    />
                  )
                })}
              </GroupMemberResourceSection>
            ))}
          </div>
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedKeys.size}
          canDelete={canManageAgents}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={
            pendingDelete.kind === 'agent'
              ? t('groupPage.confirm.agents.removeAgentTitle')
              : t('groupPage.confirm.agents.removeTopicTitle')
          }
          message={pendingDelete.message}
          confirmLabel={t('groupPage.confirm.remove')}
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}

      {showPicker ? (
        <GroupAgentPickerModal
          assistants={shareableAssistants}
          sessions={sessions}
          sharedResources={p2pAgents.sharedResources}
          sourceWorkspaceId={sourceWorkspaceId}
          onClose={() => setShowPicker(false)}
          onConfirm={handleAddAgents}
        />
      ) : null}

      {sessionActionMenu ? (
        <GroupAgentSessionActionMenu
          x={sessionActionMenu.x}
          y={sessionActionMenu.y}
          align={sessionActionMenu.align}
          permission={resolveSessionPermission(
            sessionActionMenu.resource.id,
            sessionActionMenu.sessionId,
          )}
          canSetPermission={canManagePermission(sessionActionMenu.resource)}
          onClose={() => setSessionActionMenu(null)}
          onSelect={(action) => void handleSessionAction(action)}
        />
      ) : null}
    </div>
  )
}
