import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type P2pWorkspace } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import {
  formatGroupSequencingMode,
  formatReplicationTopologyLabel,
} from '../../i18n/group-sync-labels'
import type {
  ConfirmAction,
  GroupSettingsModalProps,
  SettingsTab,
} from './group-settings-modal-types'
import { isSettingsFormDirty } from './group-settings-modal-utils'

export function useGroupSettingsModal({
  workspace,
  workspaceName,
  isOwner,
  syncStatus,
  onClose,
  onWorkspaceUpdated,
  onWorkspaceLeft,
}: GroupSettingsModalProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  useEffect(() => {
    setName(workspace.name)
    setDescription(workspace.description ?? '')
  }, [workspace.id, workspace.name, workspace.description])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const loadStoragePath = useCallback(async () => {
    setStorageLoading(true)
    const result = await window.api.invoke(IpcChannel.P2pWorkspaceGetStoragePath, {
      id: workspace.id,
    })
    setStorageLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { storagePath: string }
    setStoragePath(data.storagePath)
  }, [workspace.id])

  useEffect(() => {
    void loadStoragePath()
  }, [loadStoragePath])

  const isDirty = useMemo(
    () => isSettingsFormDirty(name, description, workspace),
    [description, name, workspace],
  )

  const openStoragePath = useCallback(async () => {
    if (!storagePath) return
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path: storagePath })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { opened: boolean; error?: string }
    if (!data.opened && data.error) {
      setError(data.error)
    }
  }, [storagePath])

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('groupPage.settings.nameRequired'))
      setActiveTab('general')
      return
    }

    setSaving(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pWorkspaceUpdate, {
      id: workspace.id,
      name: trimmedName,
      description: description.trim() || null,
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { workspace: P2pWorkspace }
    onWorkspaceUpdated(data.workspace)
    onClose()
  }, [description, name, onClose, onWorkspaceUpdated, t, workspace.id])

  const handleLeave = useCallback(async () => {
    setActionBusy(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pWorkspaceLeave, { id: workspace.id })

    setActionBusy(false)
    setConfirmAction(null)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    onWorkspaceLeft()
  }, [onWorkspaceLeft, workspace.id])

  const handleDissolve = useCallback(async () => {
    setActionBusy(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pWorkspaceDelete, { id: workspace.id })

    setActionBusy(false)
    setConfirmAction(null)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    onWorkspaceLeft()
  }, [onWorkspaceLeft, workspace.id])

  const displayLastEventSeq = Math.max(syncStatus.lastEventSeq, workspace.lastEventSeq)
  const sequencingLabel =
    formatGroupSequencingMode(syncStatus.sequencingMode, t) +
    (!isOwner && !syncStatus.ownerOnline ? t('groupPage.settings.ownerOffline') : '')
  const replicationLabel = formatReplicationTopologyLabel(syncStatus.replicationTopology, t)
  const meshDetail =
    syncStatus.replicationTopology === 'member_mesh'
      ? ` · ${t('groupPage.settings.memberNodes', { count: syncStatus.meshPeersConnected })}`
      : ''

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t('groupPage.settings.tabs.general') },
    { id: 'storage', label: t('groupPage.settings.tabs.storage') },
    { id: 'danger', label: t('groupPage.settings.tabs.danger') },
  ]

  return {
    t,
    workspace,
    workspaceName,
    isOwner,
    syncStatus,
    activeTab,
    setActiveTab,
    name,
    setName,
    description,
    setDescription,
    storagePath,
    storageLoading,
    saving,
    actionBusy,
    error,
    confirmAction,
    setConfirmAction,
    isDirty,
    openStoragePath,
    handleSave,
    handleLeave,
    handleDissolve,
    displayLastEventSeq,
    sequencingLabel,
    replicationLabel,
    meshDetail,
    tabs,
    onClose,
  }
}

export type UseGroupSettingsModalResult = ReturnType<typeof useGroupSettingsModal>
