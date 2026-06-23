import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type KnowledgeFolderKind } from '@toolman/shared'

type DefaultFolderKnowledgeKind = Exclude<KnowledgeFolderKind, 'shared'>

const ENSURE_CHANNELS: Record<DefaultFolderKnowledgeKind, IpcChannel> = {
  local: IpcChannel.KnowledgeFolderEnsure,
  network: IpcChannel.KnowledgeNetworkFolderEnsure,
  local_files: IpcChannel.KnowledgeLocalFilesFolderEnsure,
}

const SETTINGS_KEYS: Record<
  DefaultFolderKnowledgeKind,
  'knowledgeFolderPath' | 'networkKnowledgeFolderPath' | 'localFilesFolderPath'
> = {
  local: 'knowledgeFolderPath',
  network: 'networkKnowledgeFolderPath',
  local_files: 'localFilesFolderPath',
}

export function useKnowledgeDefaultFolder(
  workspaceId: string | null,
  kind: DefaultFolderKnowledgeKind,
) {
  const [path, setPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ensure = useCallback(async () => {
    if (!workspaceId) {
      setPath(null)
      setLoading(false)
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const result = await window.api.invoke(ENSURE_CHANNELS[kind], { workspaceId })
      if (!result.ok) {
        setError(result.error.message)
        return null
      }

      const data = result.data as { path: string }
      setPath(data.path)
      return data.path
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '无法初始化文件夹，请重启应用后重试'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [workspaceId, kind])

  const updatePath = useCallback(
    async (nextPath: string) => {
      if (!workspaceId) return false

      setError(null)
      const result = await window.api.invoke(IpcChannel.WorkspaceUpdate, {
        id: workspaceId,
        settings: { [SETTINGS_KEYS[kind]]: nextPath },
      })

      if (!result.ok) {
        setError(result.error.message)
        return false
      }

      setPath(nextPath)
      return true
    },
    [workspaceId, kind],
  )

  useEffect(() => {
    void ensure()
  }, [ensure])

  return {
    path,
    loading,
    error,
    setError,
    ensure,
    updatePath,
  }
}
