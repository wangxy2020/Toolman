import { useEffect, useMemo, useState } from 'react'
import type { KnowledgeBaseKind } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { normalizeUrlInput } from './knowledge-url-utils'
import { pickKnowledgeSources } from './knowledge-create-operations'
import type { KnowledgeCreateModalProps, KnowledgeSourcePick } from './knowledge-create-types'
import {
  deriveKnowledgeBaseName,
  resolveBaseFolderPath,
  resolveDisplayPath,
  resolveKbPath,
  resolveKnowledgeBaseName,
} from './knowledge-create-utils'

export function useKnowledgeCreateModal({
  defaultLocalFolderPath,
  defaultNetworkFolderPath,
  defaultLocalFilesFolderPath,
  onClose,
  onSubmit,
}: KnowledgeCreateModalProps) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<KnowledgeBaseKind>('local')
  const [description, setDescription] = useState('')
  const [sourcePick, setSourcePick] = useState<KnowledgeSourcePick>({ mode: 'none' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseFolderPath = resolveBaseFolderPath(
    kind,
    defaultLocalFolderPath,
    defaultNetworkFolderPath,
    defaultLocalFilesFolderPath,
  )

  const effectiveName = useMemo(
    () => resolveKnowledgeBaseName(name, sourcePick) ?? '',
    [name, sourcePick],
  )

  const displayPath = useMemo(
    () => resolveDisplayPath(effectiveName, baseFolderPath, sourcePick),
    [effectiveName, baseFolderPath, sourcePick],
  )

  useEffect(() => {
    setSourcePick({ mode: 'none' })
  }, [kind])

  const handleSelectSources = async () => {
    setError(null)
    const result = await pickKnowledgeSources(baseFolderPath)
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }

    setSourcePick(result.sourcePick)
    if (!name.trim() && result.derivedName) {
      setName(result.derivedName)
    }
  }

  const handleClearSelections = () => {
    setSourcePick({ mode: 'none' })
    setError(null)
  }

  const handleNetworkUrlChange = (value: string) => {
    const nextPick: KnowledgeSourcePick = value.trim()
      ? { mode: 'url', url: value }
      : { mode: 'none' }
    setSourcePick(nextPick)
    if (!name.trim() && value.trim()) {
      const derived = deriveKnowledgeBaseName(nextPick)
      if (derived) setName(derived)
    }
  }

  const handleSubmit = async () => {
    let resolvedSourcePick = sourcePick

    if (kind === 'network') {
      const rawUrl = sourcePick.mode === 'url' ? sourcePick.url : ''
      const normalizedUrl = normalizeUrlInput(rawUrl)
      if (!normalizedUrl) {
        setError(t('modals.knowledgeCreate.urlRequired'))
        return
      }
      try {
        new URL(normalizedUrl)
      } catch {
        setError(t('modals.knowledgeCreate.urlInvalid'))
        return
      }
      resolvedSourcePick = { mode: 'url', url: normalizedUrl }
    }

    const resolvedName = resolveKnowledgeBaseName(name, resolvedSourcePick)
    if (!resolvedName) {
      setError(
        kind === 'network'
          ? t('modals.knowledgeCreate.nameRequiredNetwork')
          : t('modals.knowledgeCreate.nameRequiredLocal'),
      )
      return
    }

    const kbPath = resolveKbPath(resolvedName, baseFolderPath)
    if (!kbPath) {
      setError(t('modals.knowledgeCreate.pathFailed'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name: resolvedName,
        description: description.trim() || undefined,
        kind,
        kbPath,
        sourcePick: resolvedSourcePick,
      })
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t('modals.knowledgeCreate.createFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const hasSelection = sourcePick.mode !== 'none'
  const isNetwork = kind === 'network'
  const isLocalFiles = kind === 'local_files'
  const networkUrl = sourcePick.mode === 'url' ? sourcePick.url : ''

  return {
    t,
    onClose,
    name,
    setName,
    kind,
    setKind,
    description,
    setDescription,
    sourcePick,
    submitting,
    error,
    baseFolderPath,
    displayPath,
    handleSelectSources,
    handleClearSelections,
    handleNetworkUrlChange,
    handleSubmit,
    hasSelection,
    isNetwork,
    isLocalFiles,
    networkUrl,
  }
}

export type KnowledgeCreateModalState = ReturnType<typeof useKnowledgeCreateModal>
