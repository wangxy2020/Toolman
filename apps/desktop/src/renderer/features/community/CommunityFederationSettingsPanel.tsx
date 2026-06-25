import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  CommunityHubConfig,
  CommunityFederationStatusOutput,
} from '@toolman/shared'

import { IconRefresh } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import {
  getCommunityFederationStatus,
  getCommunityHubHealth,
  syncCommunityHubPeering,
  updateCommunityHubConfig,
} from './community-api.client'

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
  const { t } = useI18n()
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

  const formatSyncTime = (value?: number) => {
    if (!value) return t('communityPage.federation.neverSynced')
    return new Date(value).toLocaleString()
  }

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
      const message =
        loadError instanceof Error ? loadError.message : t('communityPage.federation.loadFailed')
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [t])

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
      setNotice(t('communityPage.federation.saveNotice'))
      await load()
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : t('communityPage.federation.saveFailed')
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
        t('communityPage.federation.syncComplete', {
          catalogCount: result.federatedCatalogEntryCount,
          bootstrapAdded: result.libp2pBootstrapAdded,
        }),
      )
      await load()
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : t('communityPage.federation.syncFailed')
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
          <span className="tm-group-settings-section-title">{t('communityPage.federation.title')}</span>
          <button
            type="button"
            className="tm-group-settings-inline-btn"
            disabled={loading}
            onClick={() => void load()}
          >
            <IconRefresh size={14} className={loading ? 'tm-icon-spin' : undefined} />
            {t('communityPage.federation.refresh')}
          </button>
        </div>
      </div>

      {error ? <div className="tm-group-settings-error tm-group-settings-error--inline">{error}</div> : null}
      {notice ? <div className="tm-group-settings-hint">{notice}</div> : null}

      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">{t('communityPage.federation.p2pFederation')}</span>
        <span>
          {status?.federationConfig.federationEnabled
            ? t('communityPage.federation.enabled')
            : t('communityPage.federation.disabled')}
        </span>
      </div>
      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">{t('communityPage.federation.hubPeeringApi')}</span>
        <span>
          {federationPeering
            ? t('communityPage.federation.available')
            : federationPeering === false
              ? t('communityPage.federation.unavailable')
              : '—'}
        </span>
      </div>
      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">{t('communityPage.federation.catalogCache')}</span>
        <span>
          {t('communityPage.federation.catalogEntries', {
            count: status?.federatedCatalogEntryCount ?? '—',
          })}
        </span>
      </div>
      <div className="tm-group-settings-field">
        <span className="tm-group-settings-label">libp2p Bootstrap</span>
        <span>
          {t('communityPage.federation.bootstrapCount', {
            count: status?.libp2pBootstrapCount ?? '—',
          })}
        </span>
      </div>

      <label className="tm-group-settings-field">
        <span className="tm-group-settings-label">{t('communityPage.federation.peerHubAddresses')}</span>
        <textarea
          className="tm-group-settings-textarea"
          rows={4}
          value={peerText}
          disabled={!editable || saving}
          placeholder={t('communityPage.federation.peerPlaceholder')}
          onChange={(event) => setPeerText(event.target.value)}
        />
      </label>

      <label className="tm-group-settings-field">
        <span className="tm-group-settings-label">{t('communityPage.federation.upstream')}</span>
        {upstreamOptions.length > 0 ? (
          <select
            className="tm-group-settings-input"
            value={upstream}
            disabled={!editable || saving}
            onChange={(event) => setUpstream(event.target.value)}
          >
            <option value="">{t('communityPage.federation.upstreamNone')}</option>
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
        <p className="tm-group-settings-hint">{t('communityPage.federation.envOverrideHint')}</p>
      ) : (
        <p className="tm-group-settings-hint">{t('communityPage.federation.editableHint')}</p>
      )}

      <div className="tm-group-settings-inline-actions">
        <button
          type="button"
          className="tm-btn tm-btn--secondary"
          disabled={!editable || saving || loading}
          onClick={() => void handleSave()}
        >
          {saving ? t('communityPage.federation.saving') : t('communityPage.federation.savePeering')}
        </button>
        <button
          type="button"
          className="tm-btn tm-btn--primary"
          disabled={syncing || loading}
          onClick={() => void handleSyncNow()}
        >
          {syncing ? t('communityPage.federation.syncing') : t('communityPage.federation.syncNow')}
        </button>
      </div>

      {status?.syncState.peers.length ? (
        <div className="tm-community-settings-peer-table-wrap">
          <div className="tm-group-settings-section-title">{t('communityPage.federation.peerSyncStatus')}</div>
          <table className="tm-community-settings-peer-table">
            <thead>
              <tr>
                <th>Peer</th>
                <th>{t('communityPage.federation.lastSync')}</th>
                <th>Cursor</th>
                <th>{t('communityPage.federation.status')}</th>
              </tr>
            </thead>
            <tbody>
              {status.syncState.peers.map((peer) => (
                <tr key={peer.peerUrl}>
                  <td>{peer.peerUrl}</td>
                  <td>{formatSyncTime(peer.lastSyncedAt)}</td>
                  <td>{peer.updatedAfter}</td>
                  <td>
                    {peer.lastError
                      ? t('communityPage.federation.peerFailed', { error: peer.lastError })
                      : t('communityPage.federation.peerNormal')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
