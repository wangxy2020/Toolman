import { useCallback, useMemo, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { getLocalFilePaths } from '../knowledge/knowledge-file-paths'
import { GroupFileContextMenu, GroupFileList } from './GroupFileList'
import { GroupPanelHeader } from './GroupPanelHeader'
import { useP2pFiles } from './useP2pFiles'

interface Props {
  workspaceId: string
  workspaceName: string
  canManageGroupFiles: boolean
  canWriteWorkspace: boolean
  selfMemberId: string | null
  onOpenNote?: (noteId: string) => boolean
}

interface PendingDelete {
  resourceIds: string[]
  message: string
}

export function GroupFilesPanel({
  workspaceId,
  workspaceName,
  canManageGroupFiles,
  canWriteWorkspace,
  selfMemberId,
  onOpenNote,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const files = useP2pFiles({ workspaceId })

  const canDeleteFile = useCallback(
    (file: { uploadedBy: string; sharedBy: string }) =>
      canWriteWorkspace &&
      (canManageGroupFiles ||
        (selfMemberId != null &&
          (file.uploadedBy === selfMemberId || file.sharedBy === selfMemberId))),
    [canManageGroupFiles, canWriteWorkspace, selfMemberId],
  )

  const canManageFiles = useMemo(
    () => canWriteWorkspace && (canManageGroupFiles || files.files.some((file) => canDeleteFile(file))),
    [canDeleteFile, canManageGroupFiles, canWriteWorkspace, files.files],
  )

  const uploadLocalPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      await files.uploadPaths(paths)
    },
    [files.uploadPaths],
  )

  const handlePickFiles = useCallback(async () => {
    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: true,
    })

    if (!result.ok) return

    const data = result.data as { paths: string[] }
    await uploadLocalPaths(data.paths)
  }, [uploadLocalPaths])

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const paths = getLocalFilePaths(event.dataTransfer.files, event.dataTransfer)
    void uploadLocalPaths(paths)
  }

  const handleToggleSelect = useCallback((resourceId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(resourceId)) next.delete(resourceId)
      else next.add(resourceId)
      return next
    })
  }, [])

  const requestDelete = useCallback(
    (resourceIds: string[]) => {
      const deletableIds = resourceIds.filter((id) => {
        const file = files.files.find((item) => item.resourceId === id)
        return file ? canDeleteFile(file) : false
      })

      if (deletableIds.length === 0) {
        files.setError('无权移除所选文件')
        return
      }

      const names = deletableIds
        .map((id) => files.files.find((item) => item.resourceId === id)?.name)
        .filter(Boolean)
      const preview = names.slice(0, 2).join('、')
      const suffix =
        names.length > 2 ? ` 等 ${names.length} 个文件` : names.length > 1 ? '' : ''

      setPendingDelete({
        resourceIds: deletableIds,
        message: `确定从群组中移除「${preview}」${suffix}吗？`,
      })
    },
    [canDeleteFile, files],
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return

    const { resourceIds } = pendingDelete
    setPendingDelete(null)
    setDeletingId(resourceIds[0] ?? null)
    files.setError(null)

    const result = await files.deleteFiles(resourceIds)

    setDeletingId(null)
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of resourceIds) next.delete(id)
      return next
    })

    if (!result.ok) {
      files.setError(result.message)
      await files.load()
    }
  }, [files, pendingDelete])

  const handleDelete = useCallback(
    (resourceId: string) => {
      requestDelete([resourceId])
    },
    [requestDelete],
  )

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(files.files.map((file) => file.resourceId)))
  }, [files.files])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleDeleteSelected = useCallback(() => {
    requestDelete(Array.from(selectedIds))
  }, [requestDelete, selectedIds])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!canManageFiles) return
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [canManageFiles],
  )

  const handleOpenFile = useCallback(
    async (resourceId: string) => {
      setOpeningId(resourceId)
      files.setError(null)

      const downloaded = await files.downloadFile(resourceId)
      if (!downloaded?.path) {
        setOpeningId(null)
        return
      }

      const result = await window.api.invoke(IpcChannel.AppShellOpenPath, {
        path: downloaded.path,
      })

      setOpeningId(null)

      if (!result.ok) {
        files.setError(result.error.message)
      }
    },
    [files],
  )

  return (
    <div className="tm-group-member-panel tm-group-resource-panel">
      <GroupPanelHeader
        title="群组文件"
        subtitle={`${workspaceName} · ${files.files.length} 个文件`}
      />

      {files.error ? <div className="tm-error-bar">{files.error}</div> : null}

      <div
        className="tm-kb-file-panel"
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={(event) => {
          event.preventDefault()
          if (event.currentTarget === event.target) {
            setDragOver(false)
          }
        }}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
      >
        <button
          type="button"
          className={[
            'tm-kb-file-dropzone',
            dragOver ? 'tm-kb-file-dropzone--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => void handlePickFiles()}
          disabled={files.uploading || !canWriteWorkspace}
        >
          <span className="tm-kb-file-dropzone-title">
            {files.uploading ? '正在上传文件…' : '拖拽文件到这里或点击添加'}
          </span>
          <span className="tm-kb-file-dropzone-hint">
            支持文档、图片等各类文件，共享给群组成员（相同内容不可重复上传）
          </span>
        </button>

        {files.loading && files.files.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>加载文件列表中…</p>
          </div>
        ) : files.files.length === 0 ? (
          <div className="tm-kb-file-panel-empty">
            <p>暂无群组文件，拖拽或点击上方区域添加</p>
          </div>
        ) : (
          <GroupFileList
            files={files.files}
            selectedIds={selectedIds}
            canManageGroupFiles={canManageGroupFiles}
            selfMemberId={selfMemberId}
            deletingId={deletingId}
            onToggleSelect={handleToggleSelect}
            onDelete={handleDelete}
            onOpenNote={onOpenNote}
            onOpenFile={(resourceId) => void handleOpenFile(resourceId)}
            openingId={openingId}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {contextMenu ? (
        <GroupFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selectedIds.size}
          canDelete={canManageFiles}
          onClose={() => setContextMenu(null)}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onDeleteSelected={handleDeleteSelected}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="移除群组文件"
          message={pendingDelete.message}
          confirmLabel="移除"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </div>
  )
}
