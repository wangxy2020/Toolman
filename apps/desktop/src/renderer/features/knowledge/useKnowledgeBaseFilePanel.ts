import { useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { getLocalFilePaths } from './knowledge-file-paths'
import type { KnowledgeBaseFilePanelProps } from './knowledge-base-file-panel-types'
import { extractDroppedUrl } from './knowledge-base-file-panel-utils'

export function useKnowledgeBaseFilePanel({
  ingesting,
  importDisabled = false,
  defaultImportPath,
  mode = 'file',
  onImportFiles,
  onImportError,
  onOpenAddUrl,
  onAddUrl,
}: Pick<
  KnowledgeBaseFilePanelProps,
  | 'ingesting'
  | 'importDisabled'
  | 'defaultImportPath'
  | 'mode'
  | 'onImportFiles'
  | 'onImportError'
  | 'onOpenAddUrl'
  | 'onAddUrl'
>) {
  const { t } = useI18n()
  const [dragOver, setDragOver] = useState(false)
  const [picking, setPicking] = useState(false)
  const isUrlMode = mode === 'url'
  const dropzoneDisabled = ingesting || importDisabled || picking

  const importPaths = (files: FileList | File[], dataTransfer?: DataTransfer | null) => {
    const paths = getLocalFilePaths(files, dataTransfer)
    if (paths.length === 0) {
      onImportError?.(t('knowledgePage.filePanel.pathError'))
      return
    }
    void onImportFiles(paths)
  }

  const handlePickFiles = async () => {
    if (dropzoneDisabled) return

    if (isUrlMode) {
      onOpenAddUrl?.()
      return
    }

    setPicking(true)

    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, {
      multiple: true,
      defaultPath: defaultImportPath ?? undefined,
    })
    setPicking(false)

    if (!result.ok) {
      onImportError?.(result.error.message)
      return
    }

    const { paths } = result.data as { paths: string[] }
    if (paths.length === 0) return

    void onImportFiles(paths)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (ingesting || importDisabled) return

    if (isUrlMode) {
      const url = extractDroppedUrl(event.dataTransfer)
      if (!url) {
        onImportError?.(t('knowledgePage.filePanel.invalidUrl'))
        return
      }
      void onAddUrl?.(url)
      return
    }

    importPaths(event.dataTransfer.files, event.dataTransfer)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    if (!ingesting && !importDisabled) {
      event.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    if (event.currentTarget === event.target) {
      setDragOver(false)
    }
  }

  return {
    t,
    dragOver,
    dropzoneDisabled,
    isUrlMode,
    handlePickFiles,
    handleDrop,
    handleDragOver,
    handleDragLeave,
  }
}

export type KnowledgeBaseFilePanelState = ReturnType<typeof useKnowledgeBaseFilePanel>
