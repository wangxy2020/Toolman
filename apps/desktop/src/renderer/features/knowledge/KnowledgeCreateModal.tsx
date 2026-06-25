import { useEffect, useMemo, useState } from 'react'
import { IpcChannel, type KnowledgeBaseKind } from '@toolman/shared'
import {
  countKnowledgeFilesByType,
  getCommonParentPath,
  type KnowledgeFileTypeCount,
} from './knowledge-file-types'
import { buildKnowledgeBasePath, getPathBasename, stripFileExtension } from './knowledge-path-utils'
import { deriveKnowledgeBaseNameFromUrl, normalizeUrlInput } from './knowledge-url-utils'
import { useI18n } from '../../i18n/useI18n'

export type KnowledgeSourcePick =
  | { mode: 'none' }
  | { mode: 'url'; url: string }
  | { mode: 'folder-empty'; folderPath: string }
  | {
      mode: 'folder-with-files'
      folderPath: string
      totalFiles: number
      fileCounts: KnowledgeFileTypeCount[]
    }
  | {
      mode: 'files'
      parentPath: string
      filePaths: string[]
      totalFiles: number
      fileCounts: KnowledgeFileTypeCount[]
    }

export interface KnowledgeCreateInput {
  name: string
  description?: string
  kind: KnowledgeBaseKind
  kbPath: string
  sourcePick: KnowledgeSourcePick
}

interface Props {
  defaultLocalFolderPath: string | null
  defaultNetworkFolderPath: string | null
  defaultLocalFilesFolderPath: string | null
  onClose: () => void
  onSubmit: (input: KnowledgeCreateInput) => Promise<void>
}

function deriveKnowledgeBaseName(sourcePick: KnowledgeSourcePick): string | null {
  switch (sourcePick.mode) {
    case 'url':
      return deriveKnowledgeBaseNameFromUrl(sourcePick.url)
    case 'folder-empty':
    case 'folder-with-files':
      return getPathBasename(sourcePick.folderPath)
    case 'files': {
      if (sourcePick.filePaths.length === 1) {
        return stripFileExtension(getPathBasename(sourcePick.filePaths[0]))
      }
      const parentName = getPathBasename(sourcePick.parentPath)
      if (parentName) return parentName
      return stripFileExtension(getPathBasename(sourcePick.filePaths[0]))
    }
    default:
      return null
  }
}

function resolveKnowledgeBaseName(name: string, sourcePick: KnowledgeSourcePick): string | null {
  const trimmed = name.trim()
  if (trimmed) return trimmed
  return deriveKnowledgeBaseName(sourcePick)
}

function resolveKbPath(name: string, baseFolderPath: string | null): string {
  const builtPath = buildKnowledgeBasePath(baseFolderPath, name)
  if (builtPath) return builtPath
  return baseFolderPath ?? ''
}

function resolveDisplayPath(
  name: string,
  baseFolderPath: string | null,
  sourcePick: KnowledgeSourcePick,
): string {
  switch (sourcePick.mode) {
    case 'folder-with-files':
      return sourcePick.folderPath
    case 'folder-empty':
      return resolveKbPath(name, baseFolderPath) || baseFolderPath || ''
    case 'files':
      return sourcePick.parentPath
    default:
      return resolveKbPath(name, baseFolderPath) || baseFolderPath || ''
  }
}

function FileTypeSummary({
  title,
  counts,
  total,
}: {
  title: string
  counts: KnowledgeFileTypeCount[]
  total: number
}) {
  const { t } = useI18n()

  return (
    <div className="tm-kb-source-summary">
      <p className="tm-kb-source-summary-title">{title}</p>
      <ul className="tm-kb-source-summary-list">
        {counts.map((item) => (
          <li key={item.type}>
            <span className="tm-kb-source-summary-label">{item.label}</span>
            <span className="tm-kb-source-summary-count">{item.count}</span>
          </li>
        ))}
      </ul>
      <p className="tm-agent-field-hint">{t('modals.knowledgeCreate.totalFiles', { count: total })}</p>
    </div>
  )
}

export function KnowledgeCreateModal({
  defaultLocalFolderPath,
  defaultNetworkFolderPath,
  defaultLocalFilesFolderPath,
  onClose,
  onSubmit,
}: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<KnowledgeBaseKind>('local')
  const [description, setDescription] = useState('')
  const [sourcePick, setSourcePick] = useState<KnowledgeSourcePick>({ mode: 'none' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseFolderPath =
    kind === 'network'
      ? defaultNetworkFolderPath
      : kind === 'local_files'
        ? defaultLocalFilesFolderPath
        : defaultLocalFolderPath

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
    const pickResult = await window.api.invoke(IpcChannel.DialogSelectFilesOrFolders, {
      defaultPath: baseFolderPath ?? undefined,
    })
    if (!pickResult.ok) {
      setError(pickResult.error.message)
      return
    }

    const { items } = pickResult.data as { items: Array<{ path: string; isDirectory: boolean }> }
    if (items.length === 0) return

    const files = items.filter((item) => !item.isDirectory)
    const folders = items.filter((item) => item.isDirectory)

    if (files.length > 0) {
      const filePaths = files.map((item) => item.path)
      const fileCounts = countKnowledgeFilesByType(filePaths)
      const nextPick: KnowledgeSourcePick = {
        mode: 'files',
        parentPath: getCommonParentPath(filePaths),
        filePaths,
        totalFiles: filePaths.length,
        fileCounts,
      }
      setSourcePick(nextPick)
      if (!name.trim()) {
        const derived = deriveKnowledgeBaseName(nextPick)
        if (derived) setName(derived)
      }
      return
    }

    const folderPath = folders[0]?.path
    if (!folderPath) return

    const scanResult = await window.api.invoke(IpcChannel.KnowledgeFolderScanPreview, {
      folderPath,
    })
    if (!scanResult.ok) {
      setError(scanResult.error.message)
      return
    }

    const data = scanResult.data as {
      total: number
      counts: KnowledgeFileTypeCount[]
    }

    if (data.total > 0) {
      const nextPick: KnowledgeSourcePick = {
        mode: 'folder-with-files',
        folderPath,
        totalFiles: data.total,
        fileCounts: data.counts,
      }
      setSourcePick(nextPick)
      if (!name.trim()) {
        const derived = deriveKnowledgeBaseName(nextPick)
        if (derived) setName(derived)
      }
    } else {
      const nextPick: KnowledgeSourcePick = {
        mode: 'folder-empty',
        folderPath,
      }
      setSourcePick(nextPick)
      if (!name.trim()) {
        const derived = deriveKnowledgeBaseName(nextPick)
        if (derived) setName(derived)
      }
    }
  }

  const handleClearSelections = () => {
    setSourcePick({ mode: 'none' })
    setError(null)
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
      setError(submitError instanceof Error ? submitError.message : t('modals.knowledgeCreate.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const hasSelection = sourcePick.mode !== 'none'
  const isNetwork = kind === 'network'
  const isLocalFiles = kind === 'local_files'
  const networkUrl = sourcePick.mode === 'url' ? sourcePick.url : ''

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

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal tm-agent-modal--create"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-knowledge-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="add-knowledge-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('modals.knowledgeCreate.title')}
          </h3>
          <button type="button" className="tm-agent-modal-close" aria-label={t('common.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-agent-modal-body tm-agent-modal-body--single">
          <div className="tm-agent-modal-content">
            <div className="tm-agent-settings-form">
              <div className="tm-agent-setting-row">
                <label className="tm-agent-setting-label" htmlFor="kb-create-name">
                  {t('common.name')}
                  <span className="tm-agent-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="kb-create-name"
                  className="tm-agent-setting-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    isNetwork
                      ? t('modals.knowledgeCreate.namePlaceholderNetwork')
                      : t('modals.knowledgeCreate.namePlaceholderLocal')
                  }
                  autoFocus
                />
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <span className="tm-agent-setting-label">{t('modals.knowledgeCreate.typeLabel')}</span>
                <div className="tm-kb-kind-radio-group" role="radiogroup" aria-label={t('modals.knowledgeCreate.typeAria')}>
                  <label className="tm-kb-kind-radio">
                    <input
                      type="radio"
                      name="kb-kind"
                      checked={kind === 'local'}
                      onChange={() => setKind('local')}
                    />
                    <span>{t('modals.knowledgeCreate.kindLocal')}</span>
                  </label>
                  <label className="tm-kb-kind-radio">
                    <input
                      type="radio"
                      name="kb-kind"
                      checked={kind === 'network'}
                      onChange={() => setKind('network')}
                    />
                    <span>{t('modals.knowledgeCreate.kindNetwork')}</span>
                  </label>
                  <label className="tm-kb-kind-radio">
                    <input
                      type="radio"
                      name="kb-kind"
                      checked={kind === 'local_files'}
                      onChange={() => setKind('local_files')}
                    />
                    <span>{t('modals.knowledgeCreate.kindLocalFiles')}</span>
                  </label>
                </div>
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <label className="tm-agent-setting-label" htmlFor="kb-create-description">
                  {t('common.description')}
                </label>
                <textarea
                  id="kb-create-description"
                  className="tm-agent-setting-textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('modals.knowledgeCreate.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <label className="tm-agent-setting-label" htmlFor="kb-create-path">
                  {t('modals.knowledgeCreate.pathLabel')}
                </label>
                <div className="tm-agent-setting-block">
                  <input
                    id="kb-create-path"
                    className="tm-agent-setting-input"
                    readOnly
                    value={displayPath}
                    placeholder={
                      baseFolderPath
                        ? t('modals.knowledgeCreate.pathPlaceholderDefault')
                        : t('modals.knowledgeCreate.pathPlaceholderUnset')
                    }
                  />
                  <p className="tm-agent-field-hint">
                    {isLocalFiles
                      ? t('modals.knowledgeCreate.pathHintLocalFiles')
                      : t('modals.knowledgeCreate.pathHintDefault')}
                  </p>
                </div>
              </div>

              {isNetwork ? (
                <div className="tm-agent-setting-row tm-agent-setting-row--top">
                  <label className="tm-agent-setting-label" htmlFor="kb-create-url">
                    {t('modals.knowledgeCreate.urlLabel')}
                  </label>
                  <div className="tm-agent-setting-block">
                    <input
                      id="kb-create-url"
                      className="tm-agent-setting-input"
                      type="url"
                      value={networkUrl}
                      onChange={(event) => handleNetworkUrlChange(event.target.value)}
                      placeholder="https://example.com/docs"
                      disabled={submitting}
                    />
                    <p className="tm-agent-field-hint">{t('modals.knowledgeCreate.urlHint')}</p>
                  </div>
                </div>
              ) : (
                <div className="tm-agent-setting-row tm-agent-setting-row--top">
                  <span className="tm-agent-setting-label">{t('modals.knowledgeCreate.sourceLabel')}</span>
                  <div className="tm-agent-setting-block">
                    <div className="tm-agent-inline-actions">
                      <button
                        type="button"
                        className="tm-agent-action-btn"
                        onClick={() => void handleSelectSources()}
                        disabled={submitting}
                      >
                        {t('modals.knowledgeCreate.selectFiles')}
                      </button>
                      {hasSelection ? (
                        <button
                          type="button"
                          className="tm-agent-action-btn tm-agent-action-btn--ghost"
                          onClick={handleClearSelections}
                          disabled={submitting}
                        >
                          {t('common.clear')}
                        </button>
                      ) : null}
                    </div>

                    {sourcePick.mode === 'folder-with-files' ? (
                      <FileTypeSummary
                        title={
                          isLocalFiles
                            ? t('modals.knowledgeCreate.folderCopyLocalFiles')
                            : t('modals.knowledgeCreate.folderCopyKnowledge')
                        }
                        counts={sourcePick.fileCounts}
                        total={sourcePick.totalFiles}
                      />
                    ) : null}

                    {sourcePick.mode === 'files' ? (
                      <FileTypeSummary
                        title={t('modals.knowledgeCreate.filesSelected')}
                        counts={sourcePick.fileCounts}
                        total={sourcePick.totalFiles}
                      />
                    ) : null}

                    {sourcePick.mode === 'folder-empty' ? (
                      <p className="tm-agent-field-hint">{t('modals.knowledgeCreate.folderEmptyHint')}</p>
                    ) : null}

                    {sourcePick.mode === 'none' ? (
                      <p className="tm-agent-field-hint">
                        {isLocalFiles
                          ? t('modals.knowledgeCreate.sourceHintLocalFiles')
                          : t('modals.knowledgeCreate.sourceHintDefault')}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              {error ? <p className="tm-agent-form-error">{error}</p> : null}
            </div>
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? t('common.creating') : t('common.create')}
          </button>
        </footer>
      </div>
    </div>
  )
}
