import type { KnowledgeBaseSettingsModalState } from './useKnowledgeBaseSettingsModal'
import { FormLabel } from './knowledge-base-settings-components'
import { translateKnowledgeFolderName } from '../../i18n/system-labels'

type Props = Pick<
  KnowledgeBaseSettingsModalState,
  | 't'
  | 'nameReadOnly'
  | 'defaultFolderKind'
  | 'isNetworkKb'
  | 'isLocalFilesKb'
  | 'isVectorizedKb'
  | 'name'
  | 'setName'
  | 'descriptionDisplay'
  | 'setDescription'
  | 'embeddingRef'
  | 'setEmbeddingRef'
  | 'modelsLoading'
  | 'embeddingOptions'
  | 'submitting'
  | 'kbStoragePath'
  | 'handleOpenStorageInFinder'
>

export function KnowledgeBaseSettingsBasicTab(props: Props) {
  const {
    t,
    nameReadOnly = false,
    defaultFolderKind,
    isNetworkKb,
    isLocalFilesKb,
    isVectorizedKb,
    name,
    setName,
    descriptionDisplay,
    setDescription,
    embeddingRef,
    setEmbeddingRef,
    modelsLoading,
    embeddingOptions,
    submitting,
    kbStoragePath,
    handleOpenStorageInFinder,
  } = props

  return (
    <div className="tm-kb-settings-form">
      <div className="tm-kb-settings-row">
        <label className="tm-kb-settings-label" htmlFor="kb-settings-name">
          {t('knowledgePage.settings.name')}
        </label>
        <input
          id="kb-settings-name"
          className="tm-kb-settings-input"
          value={nameReadOnly ? translateKnowledgeFolderName(name, t) : name}
          onChange={(event) => setName(event.target.value)}
          readOnly={nameReadOnly}
        />
      </div>

      <div className="tm-kb-settings-row tm-kb-settings-row--top">
        <label className="tm-kb-settings-label" htmlFor="kb-settings-description">
          {t('knowledgePage.settings.descriptionOptional')}
        </label>
        <textarea
          id="kb-settings-description"
          className="tm-kb-settings-textarea"
          value={descriptionDisplay}
          onChange={(event) => setDescription(event.target.value)}
          readOnly={Boolean(defaultFolderKind)}
          rows={2}
        />
      </div>

      {isNetworkKb ? (
        <p className="tm-kb-settings-hint">{t('knowledgePage.settings.hints.networkKbBasic')}</p>
      ) : null}
      {isLocalFilesKb ? (
        <p className="tm-kb-settings-hint">{t('knowledgePage.settings.hints.localFilesBasic')}</p>
      ) : null}

      {isLocalFilesKb && kbStoragePath ? (
        <>
          <div className="tm-kb-settings-row">
            <span className="tm-kb-settings-label">{t('knowledgePage.settings.storageDir')}</span>
            <div className="tm-kb-settings-path">{kbStoragePath}</div>
          </div>
          <div className="tm-kb-settings-row-actions">
            <button
              type="button"
              className="tm-kb-settings-inline-btn"
              onClick={() => void handleOpenStorageInFinder(kbStoragePath)}
              disabled={submitting}
            >
              {t('knowledgePage.settings.openInFinder')}
            </button>
          </div>
        </>
      ) : null}

      {isVectorizedKb ? (
        <div className="tm-kb-settings-row">
          <FormLabel hint="用于将文档内容转换为向量，修改后需重建索引。">
            {t('knowledgePage.settings.embedModel')}
          </FormLabel>
          <select
            id="kb-settings-embedding"
            className="tm-kb-settings-input"
            value={embeddingRef}
            onChange={(event) => setEmbeddingRef(event.target.value)}
            disabled={modelsLoading}
          >
            {embeddingOptions.length === 0 ? (
              <option value="">{t('knowledgePage.settings.noModel')}</option>
            ) : (
              embeddingOptions.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))
            )}
          </select>
        </div>
      ) : null}

      {isNetworkKb && !defaultFolderKind && kbStoragePath ? (
        <>
          <div className="tm-kb-settings-row">
            <span className="tm-kb-settings-label">{t('knowledgePage.settings.storageDir')}</span>
            <div className="tm-kb-settings-path">{kbStoragePath}</div>
          </div>
          <div className="tm-kb-settings-row-actions">
            <button
              type="button"
              className="tm-kb-settings-inline-btn"
              onClick={() => void handleOpenStorageInFinder(kbStoragePath)}
              disabled={submitting}
            >
              {t('knowledgePage.settings.openInFinder')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
