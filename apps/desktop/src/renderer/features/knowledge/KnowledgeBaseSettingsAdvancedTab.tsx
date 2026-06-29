import type { KnowledgeBase } from '@toolman/shared'
import { KnowledgeSearchDebugPanel } from './KnowledgeSearchDebugPanel'
import { KnowledgeSourcesPanel } from './KnowledgeSourcesPanel'
import { KnowledgeIngestJobPanel } from './KnowledgeIngestJobPanel'
import type { KnowledgeBaseSettingsModalState } from './useKnowledgeBaseSettingsModal'
import { FormLabel } from './knowledge-base-settings-components'

type Props = Pick<
  KnowledgeBaseSettingsModalState,
  | 't'
  | 'kb'
  | 'workspaceId'
  | 'onSaved'
  | 'isLocalKb'
  | 'isNetworkKb'
  | 'docProcessorProviderId'
  | 'setDocProcessorProviderId'
  | 'rerankRef'
  | 'setRerankRef'
  | 'chunkSize'
  | 'setChunkSize'
  | 'chunkOverlap'
  | 'setChunkOverlap'
  | 'chunkStrategy'
  | 'setChunkStrategy'
  | 'scoreThreshold'
  | 'setScoreThreshold'
  | 'vectorBackend'
  | 'setVectorBackend'
  | 'modelsLoading'
  | 'rerankModels'
  | 'docProcessorProviders'
>

export function KnowledgeBaseSettingsAdvancedTab(props: Props) {
  const {
    t,
    kb,
    workspaceId,
    onSaved,
    isLocalKb,
    isNetworkKb,
    docProcessorProviderId,
    setDocProcessorProviderId,
    rerankRef,
    setRerankRef,
    chunkSize,
    setChunkSize,
    chunkOverlap,
    setChunkOverlap,
    chunkStrategy,
    setChunkStrategy,
    scoreThreshold,
    setScoreThreshold,
    vectorBackend,
    setVectorBackend,
    modelsLoading,
    rerankModels,
    docProcessorProviders,
  } = props

  return (
    <div className="tm-kb-settings-form">
      {isLocalKb ? (
        <div className="tm-kb-settings-row">
          <FormLabel hint={t('knowledgePage.settings.advanced.docProcessorHint')}>
            {t('knowledgePage.settings.documentProcessing')}
          </FormLabel>
          <select
            className="tm-kb-settings-input"
            value={docProcessorProviderId}
            onChange={(event) => setDocProcessorProviderId(event.target.value)}
            disabled={modelsLoading}
          >
            <option value="">{t('knowledgePage.settings.advanced.docProcessorPlaceholder')}</option>
            {docProcessorProviders.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.advanced.rerankHint')}>
          {t('knowledgePage.settings.rerankModel')}
        </FormLabel>
        <select
          className="tm-kb-settings-input"
          value={rerankRef}
          onChange={(event) => setRerankRef(event.target.value)}
          disabled={modelsLoading}
        >
          <option value="">{t('knowledgePage.settings.noModel')}</option>
          {rerankModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      <div className="tm-kb-settings-row">
        <FormLabel
          hint={
            isNetworkKb
              ? t('knowledgePage.settings.advanced.chunkStrategyNetwork')
              : t('knowledgePage.settings.advanced.chunkStrategyLocal')
          }
        >
          {t('knowledgePage.settings.chunkStrategy')}
        </FormLabel>
        <select
          className="tm-kb-settings-input"
          value={chunkStrategy}
          onChange={(event) =>
            setChunkStrategy(event.target.value as KnowledgeBase['chunkConfig']['strategy'])
          }
        >
          <option value="markdown">{t('knowledgePage.settings.chunkMarkdown')}</option>
          <option value="fixed">{t('knowledgePage.settings.chunkFixed')}</option>
          {isLocalKb ? <option value="semantic">{t('knowledgePage.settings.chunkSemantic')}</option> : null}
        </select>
      </div>

      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.advanced.chunkSizeHint')}>
          {t('knowledgePage.settings.chunkSize')}
        </FormLabel>
        <input
          className="tm-kb-settings-input"
          type="number"
          min={64}
          value={chunkSize}
          onChange={(event) => setChunkSize(event.target.value)}
          placeholder={t('knowledgePage.settings.advanced.defaultPlaceholder')}
        />
      </div>

      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.advanced.chunkOverlapHint')}>
          {t('knowledgePage.settings.chunkOverlap')}
        </FormLabel>
        <input
          className="tm-kb-settings-input"
          type="number"
          min={0}
          value={chunkOverlap}
          onChange={(event) => setChunkOverlap(event.target.value)}
          placeholder={t('knowledgePage.settings.advanced.defaultPlaceholder')}
        />
      </div>

      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.advanced.matchThresholdHint')}>
          {t('knowledgePage.settings.matchThreshold')}
        </FormLabel>
        <input
          className="tm-kb-settings-input"
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={scoreThreshold}
          onChange={(event) => setScoreThreshold(event.target.value)}
          placeholder={t('knowledgePage.settings.advanced.defaultPlaceholder')}
        />
      </div>

      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.advanced.vectorStoreHint')}>
          {t('knowledgePage.settings.vectorStore')}
        </FormLabel>
        <select
          className="tm-kb-settings-input"
          value={vectorBackend}
          onChange={(event) => setVectorBackend(event.target.value as 'file' | 'lance')}
        >
          <option value="file">{t('knowledgePage.settings.storeJson')}</option>
          <option value="lance">{t('knowledgePage.settings.storeLance')}</option>
        </select>
      </div>

      {import.meta.env.DEV ? (
        <KnowledgeSearchDebugPanel workspaceId={workspaceId} kbId={kb.id} />
      ) : null}
      <KnowledgeSourcesPanel workspaceId={workspaceId} onChanged={onSaved} />
      <KnowledgeIngestJobPanel workspaceId={workspaceId} kbId={kb.id} />
    </div>
  )
}
