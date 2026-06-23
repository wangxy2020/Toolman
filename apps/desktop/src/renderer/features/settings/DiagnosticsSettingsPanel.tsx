import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type AppGetDiagnosticsOutput } from '@toolman/shared'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
} from './SettingsShared'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function statusBadge(ok: boolean | null | undefined, okLabel: string, badLabel: string) {
  if (ok == null) return <span className="tm-settings-static">—</span>
  return (
    <span className={ok ? 'tm-diagnostics-badge tm-diagnostics-badge--ok' : 'tm-diagnostics-badge tm-diagnostics-badge--bad'}>
      {ok ? okLabel : badLabel}
    </span>
  )
}

export function DiagnosticsSettingsPanel() {
  const [snapshot, setSnapshot] = useState<AppGetDiagnosticsOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.AppGetDiagnostics)
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setSnapshot(result.data as AppGetDiagnosticsOutput)
    setError(null)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <SettingsPageLayout>
      <SettingsSection
        title="系统诊断"
        intro="查看本地数据库、知识库摄取、社区 Hub 与 P2P 群组连接状态，便于排查同步与性能问题。"
        action={
          <button
            type="button"
            className="tm-btn tm-btn--ghost tm-btn--sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? '刷新中…' : '刷新'}
          </button>
        }
      >
        {error ? <p className="tm-settings-error">{error}</p> : null}
        {snapshot ? (
          <p className="tm-settings-row-hint">采集时间：{formatTime(snapshot.collectedAt)}</p>
        ) : null}
      </SettingsSection>

      {snapshot ? (
        <>
          <SettingsSection title="数据库">
            <SettingsRow label="SQLite 路径" hint={snapshot.database.path}>
              <span className="tm-settings-static">{snapshot.database.path}</span>
            </SettingsRow>
            <SettingsRow label="数据库大小">
              <span className="tm-settings-static">{formatBytes(snapshot.database.sizeBytes)}</span>
            </SettingsRow>
            <SettingsRow
              label="中断的流式消息"
              hint="应用重启后应自动恢复；若持续大于 0，可尝试重新打开相关会话"
            >
              <span className="tm-settings-static">{snapshot.database.streamingMessageCount}</span>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="知识库摄取">
            <SettingsRow label="排队/处理中任务">
              <span className="tm-settings-static">{snapshot.ingest.pendingJobs}</span>
            </SettingsRow>
            <SettingsRow label="失败任务">
              {statusBadge(
                snapshot.ingest.failedJobs === 0,
                '无失败',
                `${snapshot.ingest.failedJobs} 个失败`,
              )}
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="社区 Hub">
            <SettingsRow label="Sidecar 进程">
              {statusBadge(snapshot.communityHub.running, '运行中', '未运行')}
            </SettingsRow>
            <SettingsRow label="服务地址">
              <span className="tm-settings-static">{snapshot.communityHub.baseUrl ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label="健康检查">
              {statusBadge(
                snapshot.communityHub.healthStatus === 'healthy',
                snapshot.communityHub.healthStatus ?? '未检查',
                snapshot.communityHub.healthStatus ?? '异常',
              )}
            </SettingsRow>
            <SettingsRow label="Hub 版本">
              <span className="tm-settings-static">{snapshot.communityHub.version ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label="资源 / 用户">
              <span className="tm-settings-static">
                {snapshot.communityHub.resourceCount ?? '—'} 资源 ·{' '}
                {snapshot.communityHub.userCount ?? '—'} 用户
              </span>
            </SettingsRow>
            {snapshot.communityHub.error ? (
              <p className="tm-settings-error">{snapshot.communityHub.error}</p>
            ) : null}
          </SettingsSection>

          <SettingsSection title="P2P 群组">
            <SettingsRow label="原生模块">
              {statusBadge(snapshot.p2p.nativeAvailable, '可用', '不可用')}
            </SettingsRow>
            <SettingsRow label="设备 ID">
              <span className="tm-settings-static">{snapshot.p2p.deviceId}</span>
            </SettingsRow>
            <SettingsRow label="显示名称">
              <span className="tm-settings-static">{snapshot.p2p.displayName ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label="局域网发现">
              {statusBadge(snapshot.p2p.discoveryRunning, '已开启', '未开启')}
            </SettingsRow>
            <SettingsRow label="群组 / 在线连接">
              <span className="tm-settings-static">
                {snapshot.p2p.workspaceCount} 个群组 · {snapshot.p2p.connectedPeers} 条在线连接
              </span>
            </SettingsRow>
            {snapshot.p2p.connections.length > 0 ? (
              <div className="tm-diagnostics-connection-list">
                {snapshot.p2p.connections.map((connection) => (
                  <div key={connection.peerDeviceId} className="tm-diagnostics-connection-item">
                    <span className="tm-diagnostics-connection-id">{connection.peerDeviceId}</span>
                    <span className="tm-diagnostics-connection-state">{connection.state}</span>
                    {connection.transport ? (
                      <span className="tm-diagnostics-connection-mode">{connection.transport}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="tm-settings-row-hint">当前没有已记录的 P2P 连接。</p>
            )}
            {snapshot.p2p.error ? <p className="tm-settings-error">{snapshot.p2p.error}</p> : null}
          </SettingsSection>

          {snapshot.recentEvents.length > 0 ? (
            <SettingsSection title="最近诊断事件">
              <ul className="tm-diagnostics-event-list">
                {snapshot.recentEvents.map((event, index) => (
                  <li key={`${event.at}-${index}`} className={`tm-diagnostics-event tm-diagnostics-event--${event.level}`}>
                    <span className="tm-diagnostics-event-time">{formatTime(event.at)}</span>
                    <span className="tm-diagnostics-event-subsystem">{event.subsystem}</span>
                    <span className="tm-diagnostics-event-message">{event.message}</span>
                  </li>
                ))}
              </ul>
            </SettingsSection>
          ) : null}
        </>
      ) : null}
    </SettingsPageLayout>
  )
}
