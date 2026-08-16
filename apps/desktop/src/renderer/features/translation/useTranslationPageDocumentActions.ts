import { useCallback, type MutableRefObject } from 'react'
import {
  DialogSelectFilesOutputSchema,
  IpcChannel,
  type TranslationLanguage,
} from '@toolman/shared'
import {
  buildDocumentPageSnapshots,
  aggregateSnapshotSourceText,
  aggregateSnapshotTargetText,
} from './document-page-snapshots'
import {
  buildDocumentExportContent,
  hasDocumentExportContent,
} from './translation-export'
import { isTranslationDocumentPath } from './translation-document-utils'
import type { TranslationDocumentWorkspaceHandle } from './TranslationDocumentWorkspace'
import type { SaveTranslationDocumentInput } from './useTranslationRecords'
import type {
  TranslationDocumentItem,
  TranslationDocumentPageSnapshot,
} from './translation-storage'

export function useTranslationPageDocumentActions(options: {
  t: (key: string, vars?: Record<string, string>) => string
  workspaceId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  sourceText: string
  targetText: string
  setError: (v: string | null) => void
  documentBusy: boolean
  documentParsing: boolean
  modelId: string | null
  canSave: boolean
  canSaveToNotes: boolean
  activeDocument: TranslationDocumentItem | null
  documentWorkspaceRef: MutableRefObject<TranslationDocumentWorkspaceHandle | null>
  livePageSnapshotsRef: MutableRefObject<TranslationDocumentPageSnapshot[]>
  onSaveDocument: (input: SaveTranslationDocumentInput) => string | null
  onSaveDocumentToNotes?: (title: string, content: string) => void
  onOpenDocumentPath: (filePath: string) => void
  showStatus: (message: string) => void
}) {
  const {
    t,
    workspaceId,
    languages,
    sourceText,
    targetText,
    setError,
    documentBusy,
    documentParsing,
    modelId,
    canSave,
    canSaveToNotes,
    activeDocument,
    documentWorkspaceRef,
    livePageSnapshotsRef,
    onSaveDocument,
    onSaveDocumentToNotes,
    onOpenDocumentPath,
    showStatus,
  } = options

  const handleSaveDocument = useCallback(() => {
    if (!canSave) return
    const pageSnapshots =
      documentWorkspaceRef.current?.getPageSnapshots() ??
      livePageSnapshotsRef.current ??
      buildDocumentPageSnapshots([])
    if (pageSnapshots.length === 0) {
      setError(t('translationPage.documents.saveNoSnapshots'))
      return
    }
    const resolvedSource =
      aggregateSnapshotSourceText(pageSnapshots).trim() || sourceText.trim()
    const resolvedTarget =
      aggregateSnapshotTargetText(pageSnapshots).trim() || targetText.trim()

    const savedId = onSaveDocument({
      sourceText: resolvedSource,
      targetText: resolvedTarget,
      languages,
      pageSnapshots,
    })
    if (!savedId) return
    showStatus(
      `${t('translationPage.documents.saved')} ${t('translationPage.documents.savedHint')}`,
    )
  }, [
    canSave,
    documentWorkspaceRef,
    languages,
    livePageSnapshotsRef,
    onSaveDocument,
    setError,
    showStatus,
    sourceText,
    t,
    targetText,
  ])

  const handleSaveToNotes = useCallback(() => {
    if (!canSaveToNotes || !activeDocument || !onSaveDocumentToNotes) return
    const liveDocument = { ...activeDocument, sourceText, targetText }
    if (!hasDocumentExportContent(liveDocument)) {
      setError(t('translationPage.sidebar.exportEmpty'))
      return
    }
    const title = activeDocument.title || activeDocument.fileName
    onSaveDocumentToNotes(title, buildDocumentExportContent(liveDocument))
    showStatus(t('translationPage.documents.savedToNotes', { title }))
  }, [
    activeDocument,
    canSaveToNotes,
    onSaveDocumentToNotes,
    setError,
    showStatus,
    sourceText,
    t,
    targetText,
  ])

  const handleOpenDocument = useCallback(async () => {
    if (!workspaceId) return
    setError(null)
    const result = await window.api.invoke(IpcChannel.DialogSelectFiles, { multiple: false })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const { paths } = DialogSelectFilesOutputSchema.parse(result.data)
    const filePath = paths[0]
    if (!filePath) return
    if (!isTranslationDocumentPath(filePath)) {
      setError(t('translationPage.documents.unsupportedType'))
      return
    }
    onOpenDocumentPath(filePath)
  }, [onOpenDocumentPath, setError, t, workspaceId])

  const handleOpenExternally = useCallback(async () => {
    if (!activeDocument?.filePath) return
    setError(null)
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, {
      path: activeDocument.filePath,
    })
    if (!result.ok) {
      setError(result.error.message)
    }
  }, [activeDocument?.filePath, setError])

  const handleParse = useCallback(() => {
    setError(null)
    if (!activeDocument) {
      setError(t('translationPage.documents.needDocument'))
      return
    }
    if (documentParsing) {
      documentWorkspaceRef.current?.stopParse()
      return
    }
    const started = documentWorkspaceRef.current?.startParse()
    if (started === false) {
      setError(t('translationPage.documents.parseNotReady'))
    }
  }, [activeDocument, documentParsing, documentWorkspaceRef, setError, t])

  const handleTranslateDocument = useCallback(() => {
    setError(null)
    if (!activeDocument || !modelId) {
      setError(t('translationPage.documents.needDocument'))
      return
    }
    if (documentBusy) {
      documentWorkspaceRef.current?.stopTranslation()
      return
    }
    const started = documentWorkspaceRef.current?.startTranslation()
    if (started === false) {
      setError(t('translationPage.documents.translateNotReady'))
    }
  }, [activeDocument, documentBusy, documentWorkspaceRef, modelId, setError, t])

  return {
    handleSaveDocument,
    handleSaveToNotes,
    handleOpenDocument,
    handleOpenExternally,
    handleParse,
    handleTranslateDocument,
  }
}
