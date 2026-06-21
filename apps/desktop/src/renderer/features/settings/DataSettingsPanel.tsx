import { useCallback, useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
} from './SettingsShared'
import { loadNotesData } from '../notes/notes-storage'

function IconSave({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function IconFolderOpen({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

function truncatePath(path: string, max = 34): string {
  if (path.length <= max) return path
  return `${path.slice(0, max)}…`
}

type PendingConfirm =
  | { kind: 'deleteKnowledge' }
  | { kind: 'clearCache' }
  | { kind: 'resetData' }

const DELETE_KNOWLEDGE_MESSAGE =
  '将删除知识库目录下的向量与索引文件，并清空数据库中的知识库文档记录。此操作不可撤销。'

const CLEAR_CACHE_MESSAGE =
  '将清除应用缓存（cache、GPUCache、Code Cache）。不影响智能体、对话、知识库、笔记与群组。'

const RESET_DATA_MESSAGE = [
  '将清除以下内容：',
  '· 应用缓存（cache、GPUCache、Code Cache）',
  '· 运行日志（logs/）',
  '· 智能体 JSON 记忆文件（agent-memory/）',
  '· 智能体任务清单（agent-tasks/）',
  '· 长期记忆（memory_entries 表及向量索引）',
  '',
  '以下内容将保留：',
  '· 智能体与对话话题',
  '· 知识库及文件',
  '· 笔记',
  '· 群组',
  '· 模型配置、账户与消息附件（toolman.db、storage/）',
].join('\n')

export function DataSettingsPanel() {
  const [stats, setStats] = useState<{
    cacheBytes: number
    userData: string
    logs: string
    knowledgeBase: string
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const result = await window.api.invoke(IpcChannel.AppGetStorageStats)
    setStatsLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setStats(result.data as typeof stats)
    setError(null)
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const openPath = async (path: string) => {
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    const data = result.data as { opened: boolean; error?: string }
    if (!data.opened && data.error) setMessage(data.error)
  }

  const handleBackup = async () => {
    setBusy(true)
    setMessage(null)
    const notesData = loadNotesData()
    const result = await window.api.invoke(IpcChannel.AppBackupData, {
      notesDataJson: JSON.stringify(notesData),
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    const data = result.data as {
      backupPath: string
      includesKnowledge?: boolean
      includesNotes?: boolean
    }
    const parts = ['数据库']
    if (data.includesKnowledge) parts.push('知识库向量')
    if (data.includesNotes) parts.push('笔记')
    setMessage(`完整备份已保存：${data.backupPath}（含 ${parts.join('、')}）`)
  }

  const handleRestore = async () => {
    const pick = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!pick.ok) return
    const folder = (pick.data as { path: string | null }).path
    if (!folder) return

    if (!window.confirm('恢复将覆盖当前数据库、知识库与笔记数据，是否继续？')) return

    setBusy(true)
    setMessage(null)
    const result = await window.api.invoke(IpcChannel.AppRestoreData, {
      backupPath: folder,
      restoreKnowledge: true,
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    const data = result.data as {
      restored: boolean
      includesKnowledge?: boolean
      notesDataJson?: string
    }
    if (data.notesDataJson) {
      window.dispatchEvent(new CustomEvent('toolman:notes-restore', { detail: data.notesDataJson }))
    }
    const parts = ['数据库']
    if (data.includesKnowledge) parts.push('知识库')
    if (data.notesDataJson) parts.push('笔记')
    setMessage(`${parts.join('、')}已恢复，请重启应用以确保数据库与知识库生效。`)
  }

  const handleDeleteKnowledge = async () => {
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.AppDeleteKnowledge)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await loadStats()
    setMessage('知识库文件已删除')
  }

  const handleClearCache = async () => {
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.AppClearCache)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await loadStats()
    setMessage('缓存已清除')
  }

  const handleReset = async () => {
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.AppResetData)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await loadStats()
    const data = result.data as { cleared?: string[]; memoryEntriesDeleted?: number }
    const memoryHint =
      data.memoryEntriesDeleted && data.memoryEntriesDeleted > 0
        ? `已清除 ${data.memoryEntriesDeleted} 条长期记忆。`
        : '长期记忆已清空。'
    const clearedHint =
      data.cleared && data.cleared.length > 0
        ? `已清除：${data.cleared.join('、')}。`
        : '未发现需清除的临时目录。'
    setMessage(`${memoryHint}${clearedHint}请重启应用以确保缓存完全生效。`)
  }

  const handleConfirm = () => {
    if (!pendingConfirm) return
    const action = pendingConfirm
    setPendingConfirm(null)

    if (action.kind === 'deleteKnowledge') {
      void handleDeleteKnowledge()
      return
    }
    if (action.kind === 'clearCache') {
      void handleClearCache()
      return
    }
    void handleReset()
  }

  const confirmDialog = pendingConfirm
    ? {
        deleteKnowledge: {
          title: '删除文件',
          message: DELETE_KNOWLEDGE_MESSAGE,
          confirmLabel: '删除',
          danger: true,
        },
        clearCache: {
          title: '清除缓存',
          message: CLEAR_CACHE_MESSAGE,
          confirmLabel: '清除',
          danger: false,
        },
        resetData: {
          title: '重置数据',
          message: RESET_DATA_MESSAGE,
          confirmLabel: '重置',
          danger: true,
        },
      }[pendingConfirm.kind]
    : null

  return (
    <SettingsPageLayout>
      <div className="tm-data-settings">
        <SettingsSection title="数据设置">
          <SettingsRow label="数据备份与恢复">
            <div className="tm-data-actions">
              <button
                type="button"
                className="tm-data-btn"
                disabled={busy}
                onClick={() => void handleBackup()}
              >
                <IconSave />
                完整备份
              </button>
              <button
                type="button"
                className="tm-data-btn"
                disabled={busy}
                onClick={() => void handleRestore()}
              >
                <IconFolderOpen />
                恢复
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="数据目录">
          <SettingsRow label="应用数据">
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.userData}>
                {statsLoading ? '加载中…' : stats ? truncatePath(stats.userData) : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats}
                onClick={() => stats && void openPath(stats.userData)}
              >
                打开目录
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label="应用日志">
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.logs}>
                {statsLoading ? '加载中…' : stats ? truncatePath(stats.logs) : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats}
                onClick={() => stats && void openPath(stats.logs)}
              >
                打开日志
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label="知识库文件">
            <button
              type="button"
              className="tm-data-btn"
              disabled={busy || !stats}
              onClick={() => setPendingConfirm({ kind: 'deleteKnowledge' })}
            >
              删除文件
            </button>
          </SettingsRow>

          <SettingsRow
            label={`清除缓存${stats ? `（${formatBytes(stats.cacheBytes)}）` : ''}`}
          >
            <button
              type="button"
              className="tm-data-btn"
              disabled={busy}
              onClick={() => setPendingConfirm({ kind: 'clearCache' })}
            >
              清除缓存
            </button>
          </SettingsRow>

          <SettingsRow label="重置数据">
            <button
              type="button"
              className="tm-data-btn tm-data-btn--danger"
              disabled={busy}
              onClick={() => setPendingConfirm({ kind: 'resetData' })}
            >
              重置数据
            </button>
          </SettingsRow>
        </SettingsSection>

        {error ? <div className="tm-settings-error">{error}</div> : null}
        {message ? <p className="tm-settings-msg">{message}</p> : null}
      </div>

      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel="取消"
          danger={confirmDialog.danger}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={handleConfirm}
        />
      ) : null}
    </SettingsPageLayout>
  )
}
