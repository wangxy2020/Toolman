import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { GroupPanelHeader } from './GroupPanelHeader'
import { GroupPanelRefreshButton } from './GroupPanelRefreshButton'
import { GroupResourcePickerModal } from './GroupResourcePickerModal'
import { useRegisterGroupPanelError } from './group-page-status'
import { createGroupPanelRefreshHandler } from './group-p2p-sync-policy'
import { useP2pWorkflow } from './useP2pWorkflow'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  p2pWorkspaceId: string
  workspaceName: string
  sourceWorkspaceId: string | null
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  selfMemberId: string | null
}

interface LocalWorkflow {
  id: string
  name: string
  description?: string
}

export function GroupWorkflowPanel({
  p2pWorkspaceId,
  workspaceName,
  sourceWorkspaceId,
  canManageGroupResources,
  canWriteWorkspace,
  selfMemberId,
}: Props) {
  const { t } = useI18n()
  const [showPicker, setShowPicker] = useState(false)
  const [localWorkflows, setLocalWorkflows] = useState<LocalWorkflow[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const p2pWorkflow = useP2pWorkflow({ workspaceId: p2pWorkspaceId })

  useRegisterGroupPanelError('workflow', p2pWorkflow.error, () => p2pWorkflow.setError(null))

  const handleRefresh = useMemo(
    () => createGroupPanelRefreshHandler(p2pWorkspaceId, () => p2pWorkflow.load()),
    [p2pWorkflow.load, p2pWorkspaceId],
  )

  useEffect(() => {
    void window.api.invoke(IpcChannel.P2pWorkflowListLocal).then((result) => {
      if (!result.ok) return
      const data = result.data as { workflows: LocalWorkflow[] }
      setLocalWorkflows(data.workflows)
    })
  }, [showPicker])

  const sharedWorkflowIds = useMemo(
    () =>
      new Set(
        p2pWorkflow.sharedResources.map((item) => item.localResourceId ?? item.id),
      ),
    [p2pWorkflow.sharedResources],
  )

  const pickerGroups = useMemo(
    () =>
      localWorkflows
        .filter((workflow) => !sharedWorkflowIds.has(workflow.id))
        .map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          items: [],
          groupSelectable: true,
        })),
    [localWorkflows, sharedWorkflowIds],
  )

  const canDeleteResource = useCallback(
    (resource: { sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupResources ||
        (selfMemberId != null && resource.sharedBy === selfMemberId)),
    [canManageGroupResources, canWriteWorkspace, selfMemberId],
  )

  const handleAddWorkflows = useCallback(
    async (selections: Array<{ groupId: string; itemIds: string[] }>) => {
      if (!sourceWorkspaceId) {
        throw new Error('工作区未就绪')
      }

      for (const selection of selections) {
        const ok = await p2pWorkflow.shareWorkflow(selection.groupId, sourceWorkspaceId)
        if (!ok) {
          throw new Error(p2pWorkflow.error ?? '添加工作流失败')
        }
      }

      await p2pWorkflow.load()
    },
    [p2pWorkflow, sourceWorkspaceId],
  )

  const confirmRemove = useCallback(async () => {
    if (!pendingRemoveId) return
    setRemovingId(pendingRemoveId)
    setPendingRemoveId(null)
    const ok = await p2pWorkflow.unshareWorkflow(pendingRemoveId)
    setRemovingId(null)
    if (!ok) return
    await p2pWorkflow.load()
  }, [pendingRemoveId, p2pWorkflow])

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title={t('groupPage.header.workflow')}
        subtitle={`${workspaceName} · ${t('groupPage.panels.count', {
          count: p2pWorkflow.sharedResources.length,
          type: t('groupPage.panels.types.workflows'),
        })}`}
        actions={
          <GroupPanelRefreshButton
            loading={p2pWorkflow.loading}
            onRefresh={() => void handleRefresh()}
          />
        }
      />

      <div className="tm-kb-file-panel">
        <button
          type="button"
          className="tm-kb-file-dropzone"
          disabled={
            p2pWorkflow.sharing ||
            !canWriteWorkspace ||
            !sourceWorkspaceId ||
            pickerGroups.length === 0
          }
          onClick={() => setShowPicker(true)}
        >
          <span className="tm-kb-file-dropzone-title">
            {p2pWorkflow.sharing
              ? t('groupPage.panels.adding', { type: t('groupPage.panels.types.workflows') })
              : t('groupPage.panels.clickAdd', { type: t('groupPage.panels.types.workflows') })}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            {t('groupPage.panels.pickHint', { type: t('groupPage.panels.types.workflows') })}
          </span>
        </button>

        {p2pWorkflow.loading && p2pWorkflow.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.loading', { type: t('groupPage.panels.types.workflows') })}</p>
          </div>
        ) : p2pWorkflow.sharedResources.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>{t('groupPage.panels.empty', { type: t('groupPage.panels.types.workflows') })}</p>
          </div>
        ) : (
          <div className="tm-group-shared-knowledge-list">
            {p2pWorkflow.sharedResources.map((resource) => (
              <section key={resource.id} className="tm-group-kb-section">
                <header className="tm-group-kb-section-header">
                  <div className="tm-group-kb-section-heading">
                    <h3 className="tm-group-kb-section-title">{resource.name}</h3>
                  </div>
                  {canDeleteResource(resource) ? (
                    <button
                      type="button"
                      className="tm-kb-file-card-action tm-kb-file-card-action--danger"
                      disabled={removingId === resource.id}
                      onClick={() => setPendingRemoveId(resource.id)}
                    >
                      移除
                    </button>
                  ) : null}
                </header>
              </section>
            ))}
          </div>
        )}
      </div>

      {showPicker ? (
        <GroupResourcePickerModal
          title="选择工作流"
          hint="勾选要添加到群组的工作流。"
          confirmLabel="添加"
          groups={pickerGroups}
          onClose={() => setShowPicker(false)}
          onConfirm={async (selections) => {
            await handleAddWorkflows(selections)
          }}
        />
      ) : null}

      {pendingRemoveId ? (
        <ConfirmDialog
          title="移除工作流"
          message="确定从群组中移除该工作流吗？"
          confirmLabel="移除"
          onConfirm={() => void confirmRemove()}
          onCancel={() => setPendingRemoveId(null)}
        />
      ) : null}
    </div>
  )
}
