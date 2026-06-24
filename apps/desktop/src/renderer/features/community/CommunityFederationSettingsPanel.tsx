import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  CommunityHubConfig,
  CommunityFederationStatusOutput,
} from '@toolman/shared'

import { IconRefresh } from '../../components/icons'
import {
  getCommunityFederationStatus,
  getCommunityHubHealth,
  syncCommunityHubPeering,
  updateCommunityHubConfig,
} from './community-api.client'

function formatSyncTime(value?: number): string {
  if (!value) return '尚未同步'
  return new Date(value).toLocaleString()
}

function peersToText(peers: string[] | undefined): string {
  return (peers ?? []).join('\n')
}

function textToPeers(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}

interface Props {
  embedded?: boolean
}

export function CommunityFederationSettingsPanel({ embedded = false }: Props) {
  const [status, setStatus] = useState<CommunityFederationStatusOutput | null>(null)
  const [federationPeering, setFederationPeering] = useState<boolean | null>(null)
  const [peerText, setPeerText] = useState('')
  const [upstream, setUpstream] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editable = status?.hubConfigEditable ?? false

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextStatus, health] = await Promise.all([
        getCommunityFederationStatus(),
        getCommunityHubHealth().catch(() => null),
      ])
      setStatus(nextStatus)
      setFederationPeering(health?.federationPeering ?? null)
      setPeerText(peersToText(nextStatus.hubConfig.peers))
      setUpstream(nextStatus.hubConfig.upstream ?? '')
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载联邦状态失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const upstreamOptions = useMemo(() => textToPeers(peerText), [peerText])

  const handleSave = async () => {
    if (!status) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const peers = textToPeers(peerText)
      const nextUpstream = upstream.trim()
      const config: CommunityHubConfig = {
        ...status.hubConfig,
        mode: status.hubConfig.mode ?? 'local',
        federation: status.hubConfig.federation ?? { enabled: true },
        peers: peers.length > 0 ? peers : undefined,
        upstream: nextUpstream || undefined,
      }
      await updateCommunityHubConfig(config)
      setNotice('联邦配置已保存，正在重新同步 peer Hub…')
      await load()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '保存失败'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await syncCommunityHubPeering()
      setNotice(
        `同步完成：联邦目录 ${result.federatedCatalogEntryCount} 条，新增 bootstrap ${result.libp2pBootstrapAdded} 个`,
      )
      await load()
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : '同步失败'
      setError(message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className={embedded ? '' : 'tm-group-settings-form'}>
      <div className="tm-group-settings-field">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span className="tm-group-settings-section-title">F1 Hub Peering</span>
          <button
            type="button"
            className="tm-group-settings-inline-btn"
            disabled={loading}
            onClick={() => void load()}
          >
            <IconRefresh size={14} className={loading ? 'tm-icon-spin' : undefined} />
            刷新
          </button>
        </div>
      </div>

      {error ? <div className="tm-group-settings-error tm-group-settings-error--inline">{error}</div> : null}
      {notice ? <div className="tm-group-settings-hint">{notice}</div> : null}

      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">P2P 联邦</span>
        <span>{status?.federationConfig.federationEnabled ? '已开启' : '已关闭'}</span>
      </div>
      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">Hub Peering API</span>
        <span>{federationPeering ? '可用' : federationPeering === false ? '不可用' : '—'}</span>
      </div>
      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">联邦目录缓存</span>
        <span>{status?.federatedCatalogEntryCount ?? '—'} 条</span>
      </div>
      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">libp2p Bootstrap</span>
        <span>{status?.libp2pBootstrapCount ?? '—'} 个</span>
      </div>

      <label className="tm-group-settings-field">
        <span className="tm-group-settings-label">Peer Hub 地址</span>
        <textarea
          className="tm-group-settings-textarea"
          rows={4}
          value={peerText}
          disabled={!editable || saving}
          placeholder={'每行一个 URL，例如：\nhttp://192.168.1.10:3721'}
          onChange={(event) => setPeerText(event.target.value)}
        />
      </label>

      <label className="tm-group-settings-field">
        <span className="tm-group-settings-label">Upstream（优先同步节点）</span>
        {upstreamOptions.length > 0 ? (
          <select
            className="tm-group-settings-input"
            value={upstream}
            disabled={!editable || saving}
            onChange={(event) => setUpstream(event.target.value)}
          >
            <option value="">（不指定）</option>
            {upstreamOptions.map((url) => (
              <option key={url} value={url}>
                {url}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="url"
            className="tm-group-settings-input"
            value={upstream}
            disabled={!editable || saving}
            placeholder="http://127.0.0.1:3721"
            onChange={(event) => setUpstream(event.target.value)}
          />
        )}
      </label>

      {!editable ? (
        <p className="tm-group-settings-hint">
          当前 Hub 配置由环境变量覆盖（`TOOLMAN_COMMUNITY_HUB_URL` / `TOOLMAN_COMMUNITY_HUB_MODE`），无法在 UI 中修改 peers。
        </p>
      ) : (
        <p className="tm-group-settings-hint">
          配置保存到 Community 数据目录下的 hub.json（与 hub.port、联邦同步状态同目录）。双开测试时，可在 B 实例填入 A 的 Hub 地址实现 HTTP catalog 同步（无需 libp2p）。
        </p>
      )}

        <div className="tm-group-settings-inline-actions">
          <button
            type="button"
            className="tm-btn tm-btn--secondary"
            disabled={!editable || saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? '保存中…' : '保存 Peering 配置'}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={syncing || loading}
            onClick={() => void handleSyncNow()}
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>

      {status?.syncState.peers.length ? (
        <div className="tm-community-settings-peer-table-wrap">
          <div className="tm-group-settings-section-title">Peer 同步状态</div>
          <table className="tm-community-settings-peer-table">
            <thead>
              <tr>
                <th>Peer</th>
                <th>上次同步</th>
                <th>Cursor</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {status.syncState.peers.map((peer) => (
                <tr key={peer.peerUrl}>
                  <td>{peer.peerUrl}</td>
                  <td>{formatSyncTime(peer.lastSyncedAt)}</td>
                  <td>{peer.updatedAfter}</td>
                  <td>{peer.lastError ? `失败：${peer.lastError}` : '正常'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
