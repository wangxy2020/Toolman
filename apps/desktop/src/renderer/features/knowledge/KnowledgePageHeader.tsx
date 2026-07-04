import { useI18n } from '../../i18n/useI18n'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'
import { IconFolderPlus, IconRefresh, IconChevronUp, IconSliders } from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { getModulePageConfig } from '../modules/module-config'
import { getParentPath } from './knowledge-dedup-utils'
import type { KnowledgePageHeaderProps } from './knowledge-page-types'

export function KnowledgePageHeader({
  sectionLabel,
  kbName,
  settingsEnabled,
  onOpenSettings,
  dedupMode = false,
  dedupFolderPath = null,
  dedupScanning = false,
  onSelectDedupFolder,
  onDedupRefresh,
  onDedupGoParent,
  toolbar,
}: KnowledgePageHeaderProps) {
  const { t } = useI18n()
  const config = getModulePageConfig('knowledge', t)

  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb tm-chat-breadcrumb--dedup">
        {dedupMode ? (
          <>
            <span className="tm-model-pill tm-module-pill">{t('knowledgePage.fileDedup')}</span>
            {dedupFolderPath ? (
              <span className="tm-dedup-header-path-group">
                {dedupScanning ? (
                  <IconRefresh size={14} className="tm-dedup-header-spinner tm-icon-spin" />
                ) : (
                  <button
                    type="button"
                    className="tm-dedup-header-icon-btn"
                    aria-label={t('knowledgePage.refreshScan')}
                    onClick={onDedupRefresh}
                  >
                    <IconRefresh size={14} />
                  </button>
                )}
                {(() => {
                  const parentLabel = t('knowledgePage.parentFolder')
                  const parentDisabled = dedupScanning || !getParentPath(dedupFolderPath)
                  const parentButton = (
                    <button
                      type="button"
                      className="tm-dedup-header-icon-btn"
                      aria-label={parentLabel}
                      disabled={parentDisabled}
                      onClick={onDedupGoParent}
                    >
                      <IconChevronUp size={14} />
                    </button>
                  )

                  return parentDisabled ? (
                    <span className="tm-header-icon-tooltip-wrap" data-tooltip={parentLabel}>
                      {parentButton}
                    </span>
                  ) : (
                    parentButton
                  )
                })()}
                <span className="tm-dedup-header-path" title={dedupFolderPath}>
                  {dedupFolderPath}
                </span>
              </span>
            ) : null}
          </>
        ) : (
          <>
            <span className="tm-model-pill tm-module-pill">{config.title}</span>
            <span className="tm-module-breadcrumb-group">
              <span className="tm-chat-breadcrumb-sep">/</span>
              <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">{sectionLabel}</span>
            </span>
            {kbName ? (
              <span className="tm-module-breadcrumb-group">
                <span className="tm-chat-breadcrumb-sep">/</span>
                <span
                  className="tm-model-pill tm-module-pill tm-module-pill--secondary"
                  title={kbName}
                >
                  {translateKnowledgeFolderName(kbName, t)}
                </span>
              </span>
            ) : null}
          </>
        )}
      </div>

      <div className="tm-chat-header-end">
        {toolbar}
        {dedupMode ? (
          <button
            type="button"
            className="tm-dedup-header-select-btn"
            onClick={onSelectDedupFolder}
          >
            <IconFolderPlus size={18} />
            <span>{t('knowledgePage.selectFolder')}</span>
          </button>
        ) : (
          <HeaderIconButton
            label={t('knowledgePage.settingsTitle', { title: config.title })}
            disabled={!settingsEnabled}
            onClick={onOpenSettings}
          >
            <IconSliders size={16} />
          </HeaderIconButton>
        )}
      </div>
    </header>
  )
}
