import { useEffect, useMemo, useState } from 'react'
import { IpcChannel, type KnowledgeBaseKind } from '@toolman/shared'
import {
  countKnowledgeFilesByType,
  getCommonParentPath,
  type KnowledgeFileTypeCount,
} from './knowledge-file-types'
import { buildKnowledgeBasePath, getPathBasename, stripFileExtension } from './knowledge-path-utils'
import { deriveKnowledgeBaseNameFromUrl, normalizeUrlInput } from './knowledge-url-utils'

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
      <p className="tm-form-hint">共 {total} 个文件</p>
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
        setError('请输入网络地址')
        return
      }
      try {
        new URL(normalizedUrl)
      } catch {
        setError('请输入有效的网络地址')
        return
      }
      resolvedSourcePick = { mode: 'url', url: normalizedUrl }
    }

    const resolvedName = resolveKnowledgeBaseName(name, resolvedSourcePick)
    if (!resolvedName) {
      setError(
        kind === 'network'
          ? '请输入知识库名称，或填写网络地址'
          : '请输入知识库名称，或选择文件夹/文件',
      )
      return
    }

    const kbPath = resolveKbPath(resolvedName, baseFolderPath)
    if (!kbPath) {
      setError('无法生成知识库路径，请检查默认文件夹设置')
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
      setError(submitError instanceof Error ? submitError.message : '创建失败')
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
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--knowledge-create" onClick={(event) => event.stopPropagation()}>
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">添加知识库</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-modal-body">
          <div className="tm-knowledge-create-form">
            <label className="tm-form-field">
              <span className="tm-form-label">
                名称<span className="tm-form-required" aria-hidden="true">*</span>
              </span>
              <input
                className="tm-form-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={
                  isNetwork
                    ? '例如：产品文档（可选，填写网络地址时自动填充）'
                    : '例如：产品文档（可选，选择文件夹/文件时自动填充）'
                }
                autoFocus
              />
            </label>

            <div className="tm-form-field tm-form-field--inline">
              <span className="tm-form-label">类型</span>
              <div className="tm-kb-kind-radio-group" role="radiogroup" aria-label="知识库类型">
                <label className="tm-kb-kind-radio">
                  <input
                    type="radio"
                    name="kb-kind"
                    checked={kind === 'local'}
                    onChange={() => setKind('local')}
                  />
                  <span>本地知识库</span>
                </label>
                <label className="tm-kb-kind-radio">
                  <input
                    type="radio"
                    name="kb-kind"
                    checked={kind === 'network'}
                    onChange={() => setKind('network')}
                  />
                  <span>网络知识库</span>
                </label>
                <label className="tm-kb-kind-radio">
                  <input
                    type="radio"
                    name="kb-kind"
                    checked={kind === 'local_files'}
                    onChange={() => setKind('local_files')}
                  />
                  <span>本地文件</span>
                </label>
              </div>
            </div>

            <label className="tm-form-field">
              <span className="tm-form-label">描述（可选）</span>
              <textarea
                className="tm-form-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="简要说明该知识库的用途"
                rows={3}
              />
            </label>

            <label className="tm-form-field">
              <span className="tm-form-label">
                {isLocalFiles ? '路径（默认在本地文件下新建文件夹）' : '路径（默认在知识库下新建文件夹）'}
              </span>
              <input
                className="tm-form-input"
                readOnly
                value={displayPath}
                placeholder={baseFolderPath ? '显示默认路径' : '未配置默认文件夹'}
              />
            </label>

            {isNetwork ? (
              <label className="tm-form-field">
                <span className="tm-form-label">网络地址</span>
                <input
                  className="tm-form-input"
                  type="url"
                  value={networkUrl}
                  onChange={(event) => handleNetworkUrlChange(event.target.value)}
                  placeholder="https://example.com/docs"
                  disabled={submitting}
                />
                <p className="tm-form-hint">
                  创建后将抓取该网页内容并建立索引，也可稍后在知识库中继续添加更多网页。
                </p>
              </label>
            ) : (
              <div className="tm-form-field">
                <div className="tm-form-field--inline tm-form-field--inline-spread">
                  <span className="tm-form-label">选择文件夹或文件</span>
                  <div className="tm-form-picker-row">
                    <button
                      type="button"
                      className="tm-btn"
                      onClick={() => void handleSelectSources()}
                      disabled={submitting}
                    >
                      选择文件或文件夹
                    </button>
                    {hasSelection ? (
                      <button
                        type="button"
                        className="tm-btn tm-btn--ghost"
                        onClick={handleClearSelections}
                        disabled={submitting}
                      >
                        清除
                      </button>
                    ) : null}
                  </div>
                </div>

                {sourcePick.mode === 'folder-with-files' ? (
                  <FileTypeSummary
                    title={
                      isLocalFiles
                        ? '文件夹内文件将全部复制到本地文件目录'
                        : '文件夹内文件将全部添加到知识库'
                    }
                    counts={sourcePick.fileCounts}
                    total={sourcePick.totalFiles}
                  />
                ) : null}

                {sourcePick.mode === 'files' ? (
                  <FileTypeSummary
                    title="已选择以下类型的文件"
                    counts={sourcePick.fileCounts}
                    total={sourcePick.totalFiles}
                  />
                ) : null}

                {sourcePick.mode === 'folder-empty' ? (
                  <p className="tm-form-hint">
                    所选文件夹中没有可导入的文件，将在知识库目录下创建新文件夹。
                  </p>
                ) : null}

                {sourcePick.mode === 'none' ? (
                  <p className="tm-form-hint">
                    {isLocalFiles
                      ? '选中文件夹时将复制全部文件到本地文件目录，不进行向量化处理。'
                      : '选中文件夹时将导入文件夹中的全部文件，选中文件时则导入选中的文件。支持MD/TXT/PDF/DOCX/HTML等格式。'}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {error ? <p className="tm-form-error">{error}</p> : null}
        </div>

        <footer className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </footer>
      </div>
    </div>
  )
}
