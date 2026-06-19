import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type P2pFileListItem, type WorkspaceEvent } from '@toolman/shared'

interface UseP2pFilesOptions {
  workspaceId: string | null
}

function mergeFileItem(current: P2pFileListItem[], incoming: P2pFileListItem): P2pFileListItem[] {
  const next = current.filter((item) => item.resourceId !== incoming.resourceId)
  return [incoming, ...next].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function useP2pFiles({ workspaceId }: UseP2pFilesOptions) {
  const [files, setFiles] = useState<P2pFileListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setFiles([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pFileList, {
      workspaceId,
      sortBy: 'updated_at',
      order: 'desc',
    })

    setLoading(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { files: P2pFileListItem[] }
    setFiles(data.files)
  }, [workspaceId])

  const deleteFiles = useCallback(
    async (resourceIds: string[]): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!workspaceId || resourceIds.length === 0) {
        return { ok: false, message: '群组未就绪' }
      }

      setError(null)

      for (const resourceId of resourceIds) {
        const result = await window.api.invoke(IpcChannel.P2pResourceUnshare, {
          workspaceId,
          resourceId,
        })

        if (!result.ok) {
          return { ok: false, message: result.error.message }
        }

        setFiles((current) => current.filter((item) => item.resourceId !== resourceId))
      }

      return { ok: true }
    },
    [workspaceId],
  )

  const downloadFile = useCallback(
    async (
      resourceId: string,
      version?: number,
      destPath?: string,
    ): Promise<{ path: string } | null> => {
      if (!workspaceId) return null

      const result = await window.api.invoke(IpcChannel.P2pFileDownload, {
        workspaceId,
        resourceId,
        version,
        destPath,
      })

      if (!result.ok) {
        setError(result.error.message)
        return null
      }

      const data = result.data as { path: string }
      return data
    },
    [workspaceId],
  )

  const uploadPaths = useCallback(
    async (paths: string[]) => {
      if (!workspaceId || paths.length === 0) return

      setUploading(true)
      setError(null)

      const failures: string[] = []
      let uploaded = 0

      try {
        for (const filePath of paths) {
          const result = await window.api.invoke(IpcChannel.P2pFileUpload, {
            workspaceId,
            filePath,
          })

          if (!result.ok) {
            failures.push(result.error.message)
            continue
          }

          uploaded += 1
          const data = result.data as {
            sharedResource: { id: string; name: string; updatedAt: number; sharedBy: string }
            version: number
            contentHash: string
            event: WorkspaceEvent
          }

          const payload = data.event.payload
          const sizeBytes =
            typeof payload.size_bytes === 'number' ? payload.size_bytes : 0
          const mimeType =
            typeof payload.mime_type === 'string' ? payload.mime_type : undefined

          setFiles((current) =>
            mergeFileItem(current, {
              resourceId: data.sharedResource.id,
              name: data.sharedResource.name,
              mimeType,
              sizeBytes,
              contentHash: data.contentHash,
              version: data.version,
              uploadedBy: data.event.operatorId,
              sharedBy: data.sharedResource.sharedBy,
              updatedAt: data.sharedResource.updatedAt,
            }),
          )
        }

        if (failures.length > 0) {
          setError(
            uploaded > 0
              ? `成功上传 ${uploaded} 个，${failures.length} 个失败：${failures[0]}`
              : failures[0],
          )
        }
      } finally {
        setUploading(false)
      }
    },
    [workspaceId],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!workspaceId) return

    const handleEvent = (payload: unknown) => {
      const event = payload as WorkspaceEvent
      if (event.workspaceId !== workspaceId) return
      if (event.resourceType !== 'File') return

      if (event.eventType === 'Deleted') {
        setFiles((current) => current.filter((item) => item.resourceId !== event.resourceId))
        return
      }

      if (event.eventType === 'Created' || event.eventType === 'Updated') {
        void load()
      }
    }

    const unsubscribeAppended = window.api.subscribe('p2p:event:appended', handleEvent)
    const unsubscribeSynced = window.api.subscribe('p2p:sync:event-applied', handleEvent)

    return () => {
      unsubscribeAppended()
      unsubscribeSynced()
    }
  }, [load, workspaceId])

  return {
    files,
    loading,
    uploading,
    error,
    setError,
    load,
    uploadPaths,
    deleteFiles,
    downloadFile,
  }
}
