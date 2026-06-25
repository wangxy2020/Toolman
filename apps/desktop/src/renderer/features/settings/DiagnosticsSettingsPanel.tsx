import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type AppGetDiagnosticsOutput } from '@toolman/shared'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from './SettingsShared'
import { useCrashReportUpload } from './useCrashReportUpload'

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
  const [yjsToggling, setYjsToggling] = useState(false)
  const [cidToggling, setCidToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const {
    status: crashUploadStatus,
    uploading: crashUploading,
    setUploadEnabled: setCrashUploadEnabled,
    uploadNow: uploadCrashReportsNow,
    refresh: refreshCrashUploadStatus,
  } = useCrashReportUpload()

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
    await refreshCrashUploadStatus().catch(() => undefined)
  }, [refreshCrashUploadStatus])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setCommunityYjsEnabled = async (enabled: boolean) => {
    setYjsToggling(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.CommunityYjsSetEnabled, { enabled })
    setYjsToggling(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  const setCommunityCidEnabled = async (enabled: boolean) => {
    setCidToggling(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.CommunityCidSetEnabled, { enabled })
    setCidToggling(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

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
        {toggleError ? <p className="tm-settings-error">{toggleError}</p> : null}
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

          <SettingsSection title="社区 Yjs">
            <SettingsRow
              label="功能开关"
              hint="开启后立即生效，用于双机 P2P 留言同步测试；测试完可关闭"
            >
              <SettingsToggle
                checked={snapshot.communityYjs.enabled}
                disabled={yjsToggling || loading}
                onChange={(enabled) => void setCommunityYjsEnabled(enabled)}
              />
            </SettingsRow>
            <SettingsRow label="Provider">
              {statusBadge(snapshot.communityYjs.running, '运行中', '未运行')}
            </SettingsRow>
            <SettingsRow label="本地 DID">
              <span className="tm-settings-static">{snapshot.communityYjs.localDid ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label="签名策略">
              <span className="tm-settings-static">
                {snapshot.communityYjs.requireSignedUpdates ? '仅接受 v2 签名更新' : '允许 v1 未签名'}
              </span>
            </SettingsRow>
            <SettingsRow label="验签统计">
              <span className="tm-settings-static">
                接受 {snapshot.communityYjs.acceptedSignedUpdates} · 拒绝未签名{' '}
                {snapshot.communityYjs.rejectedUnsignedUpdates} · 验签失败{' '}
                {snapshot.communityYjs.verifyFailures}
              </span>
            </SettingsRow>
            <SettingsRow label="屏蔽 DID">
              <span className="tm-settings-static">{snapshot.communityYjs.blockedDidCount}</span>
            </SettingsRow>
            {snapshot.communityYjs.lastError ? (
              <p className="tm-settings-error">{snapshot.communityYjs.lastError}</p>
            ) : null}
          </SettingsSection>

          <SettingsSection title="社区 CID 分发">
            <SettingsRow
              label="功能开关"
              hint="开启后立即生效，用于资源包 P2P 分发测试；测试完可关闭"
            >
              <SettingsToggle
                checked={snapshot.communityCid.enabled}
                disabled={cidToggling || loading}
                onChange={(enabled) => void setCommunityCidEnabled(enabled)}
              />
            </SettingsRow>
            <SettingsRow label="Provider">
              {statusBadge(snapshot.communityCid.running, '运行中', '未运行')}
            </SettingsRow>
            <SettingsRow label="索引包 / 分块">
              <span className="tm-settings-static">
                {snapshot.communityCid.indexedPackages} 包 · {snapshot.communityCid.indexedChunks} 块
              </span>
            </SettingsRow>
            <SettingsRow label="DHT provide / 查询">
              <span className="tm-settings-static">
                {snapshot.communityCid.dhtProvides} / {snapshot.communityCid.dhtProviderLookups}
              </span>
            </SettingsRow>
            <SettingsRow label="P2P 拉取 / 验签失败">
              <span className="tm-settings-static">
                {snapshot.communityCid.fetchedPackages} / {snapshot.communityCid.verifyFailures}
              </span>
            </SettingsRow>
            {snapshot.communityCid.lastError ? (
              <p className="tm-settings-error">{snapshot.communityCid.lastError}</p>
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
            <SettingsRow label="ICE / TURN">
              <span className="tm-settings-static">{snapshot.p2p.iceServersSummary}</span>
            </SettingsRow>
            {!snapshot.p2p.iceServersSummary.includes('TURN') ? (
              <SettingsRow label="WAN 提示">
                <span className="tm-settings-static" style={{ color: 'var(--tm-warning)' }}>
                  未配置 TURN 时，跨网 P2P 在对称 NAT 后可能无法连接。请在 userData/p2p/network.json 或环境变量中配置 TURN。
                </span>
              </SettingsRow>
            ) : null}
            <SettingsRow label="WAN / LAN 连接">
              <span className="tm-settings-static">
                {snapshot.p2p.wanConnectedPeers} WAN · {snapshot.p2p.lanConnectedPeers} LAN
              </span>
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

          <SettingsSection title="libp2p 网络">
            <SettingsRow label="原生模块">
              {statusBadge(snapshot.p2p.libp2pAvailable, '可用', '不可用')}
            </SettingsRow>
            <SettingsRow label="运行状态">
              {statusBadge(snapshot.p2p.libp2pRunning, '运行中', '未运行')}
            </SettingsRow>
            <SettingsRow label="本地 PeerId">
              <span className="tm-settings-static">{snapshot.p2p.libp2pPeerId ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label="libp2p / WebRTC 连接">
              <span className="tm-settings-static">
                {snapshot.p2p.libp2pPeerCount} / {snapshot.p2p.connectedPeers}
              </span>
            </SettingsRow>
            <SettingsRow label="Kademlia DHT">
              <span className="tm-settings-static">
                {snapshot.p2p.dhtMode ?? '—'} ·{' '}
                {snapshot.p2p.dhtReady == null
                  ? '—'
                  : snapshot.p2p.dhtReady
                    ? '就绪'
                    : '未就绪'}
              </span>
            </SettingsRow>
            {snapshot.p2p.libp2pPeers.length > 0 ? (
              <div className="tm-diagnostics-connection-list">
                {snapshot.p2p.libp2pPeers.map((peer) => (
                  <div key={peer.peerId} className="tm-diagnostics-connection-item">
                    <span className="tm-diagnostics-connection-id">{peer.peerId}</span>
                    <span className="tm-diagnostics-connection-state">{peer.transport}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="tm-settings-row-hint">当前没有 libp2p 对等连接。</p>
            )}
          </SettingsSection>

          <SettingsSection title="运维与更新">
            <SettingsRow label="应用版本">
              <span className="tm-settings-static">{snapshot.operations.appVersion}</span>
            </SettingsRow>
            <SettingsRow label="诊断日志">
              <span className="tm-settings-static">{snapshot.operations.logFilePath}</span>
            </SettingsRow>
            <SettingsRow label="崩溃报告">
              <span className="tm-settings-static">
                {snapshot.operations.crashReportCount} 份 · {snapshot.operations.crashReportDir}
              </span>
            </SettingsRow>
            <SettingsRow
              label="上传崩溃报告"
              hint="开启后，脱敏的崩溃摘要会上传到官方 Hub，不含消息正文或 API Key。默认关闭。"
            >
              <SettingsToggle
                checked={crashUploadStatus?.uploadEnabled ?? snapshot.operations.crashReportUploadEnabled}
                disabled={crashUploading}
                onChange={(checked) => {
                  void setCrashUploadEnabled(checked).catch((err) => {
                    setToggleError(err instanceof Error ? err.message : '更新崩溃上报设置失败')
                  })
                }}
              />
            </SettingsRow>
            <SettingsRow label="待上传">
              <span className="tm-settings-static">
                {crashUploadStatus?.pendingCount ?? snapshot.operations.crashReportPendingUpload} 份
              </span>
            </SettingsRow>
            {snapshot.operations.crashReportIngestUrl ? (
              <SettingsRow label="上报地址">
                <span className="tm-settings-static">{snapshot.operations.crashReportIngestUrl}</span>
              </SettingsRow>
            ) : null}
            {crashUploadStatus?.lastUploadError ? (
              <p className="tm-settings-row-hint">{crashUploadStatus.lastUploadError}</p>
            ) : null}
            <SettingsRow label="立即上传">
              <button
                type="button"
                className="tm-data-btn"
                disabled={
                  crashUploading ||
                  (crashUploadStatus?.pendingCount ?? snapshot.operations.crashReportPendingUpload) === 0
                }
                onClick={() => {
                  void uploadCrashReportsNow().catch((err) => {
                    setToggleError(err instanceof Error ? err.message : '上传崩溃报告失败')
                  })
                }}
              >
                {crashUploading ? '上传中…' : '上传待处理报告'}
              </button>
            </SettingsRow>
            <SettingsRow label="更新通道">
              <span className="tm-settings-static">{snapshot.operations.update.channel}</span>
            </SettingsRow>
            <SettingsRow label="最新版本">
              {statusBadge(
                !snapshot.operations.update.updateAvailable,
                snapshot.operations.update.latestVersion ?? snapshot.operations.update.currentVersion,
                `可更新至 ${snapshot.operations.update.latestVersion}`,
              )}
            </SettingsRow>
            <SettingsRow label="Manifest 路径">
              <span className="tm-settings-static">{snapshot.operations.update.manifestPath}</span>
            </SettingsRow>
            {snapshot.operations.update.notes ? (
              <p className="tm-settings-row-hint">{snapshot.operations.update.notes}</p>
            ) : null}
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
