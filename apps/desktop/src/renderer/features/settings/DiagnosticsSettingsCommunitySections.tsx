import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow, SettingsToggle } from './SettingsShared'
import { statusBadge } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
  yjsToggling: boolean
  cidToggling: boolean
  loading: boolean
  onYjsToggle: (enabled: boolean) => void
  onCidToggle: (enabled: boolean) => void
}

export function DiagnosticsSettingsCommunitySections({
  snapshot,
  yjsToggling,
  cidToggling,
  loading,
  onYjsToggle,
  onCidToggle,
}: Props) {
  const { t } = useI18n()

  return (
    <>
      <SettingsCollapsibleSection title={t('settings.diagnostics.yjs.title')} debugOnly>
        <SettingsRow
          label={t('settings.diagnostics.yjs.featureToggle')}
          hint={t('settings.diagnostics.yjs.featureToggleHint')}
        >
          <SettingsToggle
            checked={snapshot.communityYjs.enabled}
            disabled={yjsToggling || loading}
            onChange={onYjsToggle}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.yjs.provider')}>
          {statusBadge(
            snapshot.communityYjs.running,
            t('settings.diagnostics.status.running'),
            t('settings.diagnostics.status.stopped'),
          )}
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.yjs.localDid')}>
          <span className="tm-settings-static">{snapshot.communityYjs.localDid ?? '—'}</span>
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.yjs.signingPolicy')}>
          <span className="tm-settings-static">
            {snapshot.communityYjs.requireSignedUpdates
              ? t('settings.diagnostics.yjs.signedOnly')
              : t('settings.diagnostics.yjs.allowUnsigned')}
          </span>
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.yjs.verifyStats')}>
          <span className="tm-settings-static">
            {t('settings.diagnostics.yjs.acceptedSigned', {
              count: snapshot.communityYjs.acceptedSignedUpdates,
            })}{' '}
            ·{' '}
            {t('settings.diagnostics.yjs.rejectedUnsigned', {
              count: snapshot.communityYjs.rejectedUnsignedUpdates,
            })}{' '}
            ·{' '}
            {t('settings.diagnostics.yjs.verifyFailures', {
              count: snapshot.communityYjs.verifyFailures,
            })}
          </span>
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.yjs.blockedDids')}>
          <span className="tm-settings-static">{snapshot.communityYjs.blockedDidCount}</span>
        </SettingsRow>
        {snapshot.communityYjs.lastError ? (
          <p className="tm-settings-error">{snapshot.communityYjs.lastError}</p>
        ) : null}
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection title={t('settings.diagnostics.cid.title')} debugOnly>
        <SettingsRow
          label={t('settings.diagnostics.cid.featureToggle')}
          hint={t('settings.diagnostics.cid.featureToggleHint')}
        >
          <SettingsToggle
            checked={snapshot.communityCid.enabled}
            disabled={cidToggling || loading}
            onChange={onCidToggle}
          />
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.cid.provider')}>
          {statusBadge(
            snapshot.communityCid.running,
            t('settings.diagnostics.status.running'),
            t('settings.diagnostics.status.stopped'),
          )}
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.cid.indexed')}>
          <span className="tm-settings-static">
            {t('settings.diagnostics.cid.indexedCount', {
              packages: snapshot.communityCid.indexedPackages,
              chunks: snapshot.communityCid.indexedChunks,
            })}
          </span>
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.cid.dht')}>
          <span className="tm-settings-static">
            {t('settings.diagnostics.cid.dhtCount', {
              provides: snapshot.communityCid.dhtProvides,
              lookups: snapshot.communityCid.dhtProviderLookups,
            })}
          </span>
        </SettingsRow>
        <SettingsRow label={t('settings.diagnostics.cid.fetchVerify')}>
          <span className="tm-settings-static">
            {t('settings.diagnostics.cid.fetchVerifyCount', {
              fetched: snapshot.communityCid.fetchedPackages,
              failures: snapshot.communityCid.verifyFailures,
            })}
          </span>
        </SettingsRow>
        {snapshot.communityCid.lastError ? (
          <p className="tm-settings-error">{snapshot.communityCid.lastError}</p>
        ) : null}
      </SettingsCollapsibleSection>
    </>
  )
}
