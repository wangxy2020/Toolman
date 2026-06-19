import { useCallback, useEffect, useState } from 'react'
import type { KnowledgeBase, KnowledgeFolderKind } from '@toolman/shared'
import { ensureDefaultFolderKb } from './knowledge-import-files'

export function useDefaultFolderKnowledgeBase(
  workspaceId: string | null,
  kind: KnowledgeFolderKind,
  enabled: boolean,
) {
  const [kb, setKb] = useState<KnowledgeBase | null>(null)
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!workspaceId || !enabled) {
      setKb(null)
      setFolderPath(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void ensureDefaultFolderKb(workspaceId, kind)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setError('无法初始化默认文件夹知识库，请重启应用后重试')
          setKb(null)
          setFolderPath(null)
          return
        }
        setKb(result.kb)
        setFolderPath(result.folderPath)
      })
      .catch(() => {
        if (cancelled) return
        setError('无法初始化默认文件夹知识库，请重启应用后重试')
        setKb(null)
        setFolderPath(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId, kind, enabled, reloadKey])

  return { kb, kbId: kb?.id ?? null, folderPath, loading, error, setError, reload }
}
