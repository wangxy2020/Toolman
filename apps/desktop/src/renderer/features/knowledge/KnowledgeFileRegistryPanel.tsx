import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type KnowledgeFileRegistryItem } from '@toolman/shared'
import { IconExternalLink, IconFile } from '../../components/icons'
import { useRegisterModulePanelError, useRegisterModulePanelStatus } from '../../components/module-page-status'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceId: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export function KnowledgeFileRegistryPanel({ workspaceId }: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<KnowledgeFileRegistryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await window.api.invoke(IpcChannel.KnowledgeFileRegistryList, {
      workspaceId,
      limit: 500,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { items: KnowledgeFileRegistryItem[] }
    setItems(data.items)
  }, [workspaceId])

  useEffect(() => {
    void load()
  }, [load])

  useRegisterModulePanelError('knowledge-registry', error, () => setError(null))
  useRegisterModulePanelStatus(
    'knowledge-registry-loading',
    loading ? { tone: 'info', message: t('knowledgePage.registry.loadingStatus') } : null,
  )

  const handleOpenPath = async (absolutePath: string) => {
    await window.api.invoke(IpcChannel.AppShellOpenPath, { path: absolutePath })
  }

  return (
    <div className="tm-registry-page">
      <div className="tm-registry-intro">
        <p className="tm-registry-intro-title">{t('knowledgePage.registry.introTitle')}</p>
        <p className="tm-registry-intro-hint">{t('knowledgePage.registry.introHint')}</p>
      </div>

      <div className="tm-registry-toolbar">
        <span className="tm-registry-count">
          {loading
            ? t('knowledgePage.registry.countLoading')
            : t('knowledgePage.registry.count', { count: items.length })}
        </span>
        <button type="button" className="tm-btn tm-btn--ghost" onClick={() => void load()} disabled={loading}>
          {loading ? t('knowledgePage.registry.refreshing') : t('knowledgePage.registry.refresh')}
        </button>
      </div>

      {!loading && items.length === 0 ? (
        <div className="tm-registry-empty">
          <p className="tm-registry-empty-title">{t('knowledgePage.registry.emptyTitle')}</p>
          <p className="tm-registry-empty-hint">{t('knowledgePage.registry.emptyHint')}</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="tm-registry-table-wrap">
          <table className="tm-registry-table">
            <colgroup>
              <col className="tm-registry-col-file" />
              <col className="tm-registry-col-kb" />
              <col className="tm-registry-col-size" />
              <col className="tm-registry-col-hash" />
              <col className="tm-registry-col-time" />
              <col className="tm-registry-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="tm-registry-col-file">{t('knowledgePage.registry.columns.file')}</th>
                <th className="tm-registry-col-kb">{t('knowledgePage.registry.columns.kb')}</th>
                <th className="tm-registry-col-size">{t('knowledgePage.registry.columns.size')}</th>
                <th className="tm-registry-col-hash">{t('knowledgePage.registry.columns.hash')}</th>
                <th className="tm-registry-col-time">{t('knowledgePage.registry.columns.updatedAt')}</th>
                <th className="tm-registry-col-actions">{t('knowledgePage.registry.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const displayName = item.documentTitle ?? fileNameFromPath(item.absolutePath)
                return (
                  <tr key={item.id}>
                    <td className="tm-registry-col-file">
                      <div className="tm-registry-file-cell">
                        <IconFile size={16} className="tm-registry-file-icon" />
                        <div
                          className="tm-registry-file-name"
                          title={`${displayName}\n${item.absolutePath}`}
                        >
                          {displayName}
                        </div>
                      </div>
                    </td>
                    <td className="tm-registry-col-kb" title={item.kbName ?? undefined}>
                      {item.kbName ?? '—'}
                    </td>
                    <td className="tm-registry-col-size">{formatBytes(item.sizeBytes)}</td>
                    <td className="tm-registry-col-hash" title={item.contentHash}>
                      {item.contentHash}
                    </td>
                    <td
                      className="tm-registry-col-time"
                      title={new Date(item.updatedAt).toLocaleString()}
                    >
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                    <td className="tm-registry-col-actions">
                      <div className="tm-registry-actions-cell">
                        <button
                          type="button"
                          className="tm-registry-action-btn"
                          title={t('knowledgePage.registry.openInFinder')}
                          onClick={() => void handleOpenPath(item.absolutePath)}
                        >
                          <IconExternalLink size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
