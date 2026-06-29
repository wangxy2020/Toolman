import { CommunityPublishModalNotice } from './CommunityPublishModalShell'
import type { CommunityResourcePublishState } from './useCommunityResourcePublishModal'

type PackageSlice = Pick<
  CommunityResourcePublishState,
  | 't'
  | 'resourceType'
  | 'publishConfig'
  | 'changelog'
  | 'setChangelog'
  | 'knowledgeBases'
  | 'selectedKbId'
  | 'setSelectedKbId'
  | 'packagingKb'
  | 'mcpServers'
  | 'selectedMcpId'
  | 'setSelectedMcpId'
  | 'packagingMcp'
  | 'preparingPackage'
  | 'submitting'
  | 'packageDisplayName'
  | 'showKbAdvanced'
  | 'setShowKbAdvanced'
  | 'showMcpAdvanced'
  | 'setShowMcpAdvanced'
  | 'handlePackageKnowledgeBase'
  | 'handlePackageMcpServer'
  | 'handlePickPackage'
>

export function CommunityResourcePublishPackageSection({ form }: { form: PackageSlice }) {
  const {
    t,
    resourceType,
    publishConfig,
    changelog,
    setChangelog,
    knowledgeBases,
    selectedKbId,
    setSelectedKbId,
    packagingKb,
    mcpServers,
    selectedMcpId,
    setSelectedMcpId,
    packagingMcp,
    preparingPackage,
    submitting,
    packageDisplayName,
    showKbAdvanced,
    setShowKbAdvanced,
    showMcpAdvanced,
    setShowMcpAdvanced,
    handlePackageKnowledgeBase,
    handlePackageMcpServer,
    handlePickPackage,
  } = form

  return (
    <>
      <label className="tm-community-publish-field">
        <span className="tm-community-publish-label">
          {t('communityPage.resourcePublish.changelogLabel')}{' '}
          <span className="tm-community-publish-label-optional">{t('communityPage.publish.optional')}</span>
        </span>
        <input
          type="text"
          className="tm-community-publish-input"
          value={changelog}
          onChange={(event) => setChangelog(event.target.value)}
          placeholder={t('communityPage.resourcePublish.changelogPlaceholder')}
        />
      </label>

      <div className="tm-community-publish-field tm-community-publish-field--upload">
        <span className="tm-community-publish-label">{t('communityPage.resourcePublish.packageLabel')}</span>
        {resourceType === 'knowledge' && publishConfig.localPackSummary ? (
          <details
            className="tm-community-publish-field"
            style={{ marginBottom: 12 }}
            open={showKbAdvanced}
            onToggle={(event) => setShowKbAdvanced((event.target as HTMLDetailsElement).open)}
          >
            <summary className="tm-community-publish-label" style={{ cursor: 'pointer' }}>
              {publishConfig.localPackSummary}
            </summary>
            {knowledgeBases.length > 0 ? (
              <div className="tm-community-publish-grid" style={{ marginTop: 12 }}>
                <label className="tm-community-publish-field">
                  <span className="tm-community-publish-label">
                    {t('communityPage.resourcePublish.localKnowledgeBase')}
                  </span>
                  <select
                    className="tm-community-publish-input tm-community-publish-input--select"
                    value={selectedKbId}
                    onChange={(event) => setSelectedKbId(event.target.value)}
                  >
                    {knowledgeBases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.kind === 'shared' ? t('communityPage.resourcePublish.sharedSuffix') : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tm-community-publish-field">
                  <span className="tm-community-publish-label">&nbsp;</span>
                  <button
                    type="button"
                    className="tm-community-publish-upload-btn"
                    disabled={packagingKb || submitting || preparingPackage}
                    onClick={() => void handlePackageKnowledgeBase()}
                  >
                    {packagingKb
                      ? t('communityPage.resourcePublish.packingKb')
                      : t('communityPage.resourcePublish.packKb')}
                  </button>
                </div>
              </div>
            ) : (
              <CommunityPublishModalNotice message={t('communityPage.resourcePublish.kbEmptyHint')} />
            )}
          </details>
        ) : null}
        {resourceType === 'mcp' && publishConfig.localPackSummary ? (
          <details
            className="tm-community-publish-field"
            style={{ marginBottom: 12 }}
            open={showMcpAdvanced}
            onToggle={(event) => setShowMcpAdvanced((event.target as HTMLDetailsElement).open)}
          >
            <summary className="tm-community-publish-label" style={{ cursor: 'pointer' }}>
              {publishConfig.localPackSummary}
            </summary>
            {mcpServers.length > 0 ? (
              <div className="tm-community-publish-grid" style={{ marginTop: 12 }}>
                <label className="tm-community-publish-field">
                  <span className="tm-community-publish-label">
                    {t('communityPage.resourcePublish.localMcpConfig')}
                  </span>
                  <select
                    className="tm-community-publish-input tm-community-publish-input--select"
                    value={selectedMcpId}
                    onChange={(event) => setSelectedMcpId(event.target.value)}
                  >
                    {mcpServers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}（{item.type}）
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tm-community-publish-field">
                  <span className="tm-community-publish-label">&nbsp;</span>
                  <button
                    type="button"
                    className="tm-community-publish-upload-btn"
                    disabled={packagingMcp || submitting || preparingPackage}
                    onClick={() => void handlePackageMcpServer()}
                  >
                    {packagingMcp
                      ? t('communityPage.resourcePublish.exportingMcp')
                      : t('communityPage.resourcePublish.exportMcp')}
                  </button>
                </div>
              </div>
            ) : (
              <CommunityPublishModalNotice message={t('communityPage.resourcePublish.mcpEmptyHint')} />
            )}
          </details>
        ) : null}
        <div className="tm-community-publish-upload-card">
          <div className="tm-community-publish-upload-row">
            <div
              className={[
                'tm-community-publish-upload-path',
                packageDisplayName ? 'tm-community-publish-upload-path--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={packageDisplayName || undefined}
            >
              {preparingPackage
                ? t('communityPage.resourcePublish.convertingPackage')
                : packageDisplayName || publishConfig.packagePickerPlaceholder}
            </div>
            <button
              type="button"
              className="tm-community-publish-upload-btn"
              disabled={preparingPackage || submitting}
              onClick={() => void handlePickPackage()}
            >
              {preparingPackage
                ? t('communityPage.resourcePublish.converting')
                : t('communityPage.resourcePublish.pickFile')}
            </button>
          </div>
          <p className="tm-community-publish-upload-hint">
            <span className="tm-community-publish-upload-hint-icon" aria-hidden="true">
              ⓘ
            </span>
            <span>
              {publishConfig.packageHint}{' '}
              {t('communityPage.resourcePublish.packageMustInclude', {
                file: publishConfig.manifestFile,
              })}
            </span>
          </p>
        </div>
      </div>
    </>
  )
}
