import { useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { DedupScanState } from './knowledge-dedup-types'
import { getParentPath } from './knowledge-dedup-utils'

export function useKnowledgePageDedup(isFileDedupView: boolean) {
  const [dedupFolderPath, setDedupFolderPath] = useState<string | null>(null)
  const [dedupScanState, setDedupScanState] = useState<DedupScanState>({
    scanning: false,
    progress: null,
  })
  const [dedupRefreshToken, setDedupRefreshToken] = useState(0)

  useEffect(() => {
    if (!isFileDedupView) {
      setDedupFolderPath(null)
      setDedupScanState({ scanning: false, progress: null })
      setDedupRefreshToken(0)
    }
  }, [isFileDedupView])

  const handleSelectDedupFolder = async () => {
    const result = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!result.ok) return
    const path = (result.data as { path: string | null }).path
    if (!path) return
    setDedupFolderPath(path)
  }

  const handleDedupRefresh = () => {
    if (!dedupFolderPath) return
    setDedupRefreshToken((value) => value + 1)
  }

  const handleDedupGoParent = () => {
    if (!dedupFolderPath) return
    const parent = getParentPath(dedupFolderPath)
    if (parent) setDedupFolderPath(parent)
  }

  return {
    dedupFolderPath,
    setDedupFolderPath,
    dedupScanState,
    setDedupScanState,
    dedupRefreshToken,
    handleSelectDedupFolder,
    handleDedupRefresh,
    handleDedupGoParent,
  }
}
