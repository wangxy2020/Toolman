import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { P2pWorkspace } from '@toolman/shared'
import { useGroupMemberLimitWarning } from './useGroupMemberLimitWarning'
import { useP2pWorkspace } from './useP2pWorkspace'
import { useP2pEvents } from './useP2pEvents'
import { useP2pSyncStatus } from './useP2pSyncStatus'
import { useGroupWorkspaceBootstrap } from './useGroupWorkspaceBootstrap'
import { useAuthSession } from '../user/AuthSessionProvider'
import { useI18n } from '../../i18n/useI18n'
import { translateGroupName } from '../../i18n/system-labels'
import { buildGroupPageHeaderActions } from './group-page-header-actions'
import type { GroupPageProps } from './group-page-component-types'
import { DEFAULT_GROUP_ACTION } from './group-page-component-types'

export function useGroupPage({
  workspace,
  onWorkspaceUpdated,
  onWorkspaceLeft,
  requireRegistration,
}: GroupPageProps) {
  const { t } = useI18n()
  const [activeAction, setActiveAction] = useState<string | null>(DEFAULT_GROUP_ACTION)
  const [showSettings, setShowSettings] = useState(false)
  const [membersMenuOpen, setMembersMenuOpen] = useState(false)
  const membersButtonRef = useRef<HTMLButtonElement>(null)
  const { session } = useAuthSession()

  const headerActions = useMemo(() => buildGroupPageHeaderActions(t), [t])

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

  const guardGroupAccess = useCallback(() => {
    if (!requireRegistration) return true
    return requireRegistration('group')
  }, [requireRegistration])

  const handleHeaderActionClick = useCallback(
    (actionKey: string) => {
      if (!guardGroupAccess()) return
      if (!workspace) return
      if (actionKey === 'members') {
        setMembersMenuOpen((current) => !current)
        return
      }
      setMembersMenuOpen(false)
      setActiveAction((prev) => (prev === actionKey ? null : actionKey))
    },
    [guardGroupAccess, workspace],
  )

  const handleOpenSettings = useCallback(() => {
    if (!guardGroupAccess()) return
    if (!workspace) return
    setShowSettings(true)
  }, [guardGroupAccess, workspace])

  const handleWorkspaceLeft = useCallback(() => {
    setShowSettings(false)
    onWorkspaceLeft?.()
  }, [onWorkspaceLeft])

  return {
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
  }
}

export type UseGroupPageResult = ReturnType<typeof useGroupPage>
