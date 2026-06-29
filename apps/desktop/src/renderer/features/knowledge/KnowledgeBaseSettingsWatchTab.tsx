import { DEFAULT_KNOWLEDGE_WATCH_CONFIG, KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER } from '@toolman/shared'
import type { KnowledgeBaseSettingsModalState } from './useKnowledgeBaseSettingsModal'
import { FormLabel, WatchStatusBadge } from './knowledge-base-settings-components'
import { patternsToText } from './knowledge-base-settings-utils'

type LocalWatchProps = Pick<
  KnowledgeBaseSettingsModalState,
  | 't'
  | 'watchInclude'
  | 'setWatchInclude'
  | 'watchExclude'
  | 'setWatchExclude'
  | 'watchDebounceMs'
  | 'setWatchDebounceMs'
  | 'watchChanged'
  | 'watchStatus'
  | 'isWatchingStoragePath'
>

export function KnowledgeBaseSettingsLocalWatchTab(props: LocalWatchProps) {
  const {
    t,
    watchInclude,
    setWatchInclude,
    watchExclude,
    setWatchExclude,
    watchDebounceMs,
    setWatchDebounceMs,
    watchChanged,
    watchStatus,
    isWatchingStoragePath,
  } = props

  return (
    <div className="tm-kb-settings-form">
      <div className="tm-kb-settings-section-head">
        <span className="tm-kb-settings-section-title">{t('knowledgePage.settings.includeRules')}</span>
        <WatchStatusBadge
          loading={watchStatus.loading}
          watching={isWatchingStoragePath}
          loadingLabel={t('knowledgePage.settings.checking')}
          watchingLabel={t('knowledgePage.settings.watching')}
          notWatchingLabel={t('knowledgePage.settings.notWatching')}
        />
      </div>
      <textarea
        className="tm-kb-settings-textarea tm-kb-settings-textarea--mono"
        value={watchInclude}
        onChange={(event) => setWatchInclude(event.target.value)}
        placeholder={KNOWLEDGE_WATCH_INCLUDE_PLACEHOLDER}
        rows={4}
      />
      <p className="tm-kb-settings-hint">{t('knowledgePage.settings.watch.supportedTypes')}</p>

      <div className="tm-kb-settings-field-block">
        <FormLabel hint={t('knowledgePage.settings.watch.excludeHint')}>
          {t('knowledgePage.settings.excludeRules')}
        </FormLabel>
        <textarea
          className="tm-kb-settings-textarea tm-kb-settings-textarea--mono"
          value={watchExclude}
          onChange={(event) => setWatchExclude(event.target.value)}
          placeholder={patternsToText(DEFAULT_KNOWLEDGE_WATCH_CONFIG.exclude)}
          rows={3}
        />
        <p className="tm-kb-settings-hint">{t('knowledgePage.settings.watch.officeTempExclude')}</p>
      </div>

      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.watch.debounceHint')}>
          {t('knowledgePage.settings.debounce')}
        </FormLabel>
        <input
          className="tm-kb-settings-input"
          type="number"
          min={100}
          value={watchDebounceMs}
          onChange={(event) => setWatchDebounceMs(event.target.value)}
          placeholder={t('knowledgePage.settings.watch.defaultDebounce', {
            value: DEFAULT_KNOWLEDGE_WATCH_CONFIG.debounceMs,
          })}
        />
      </div>

      {watchChanged ? (
        <p className="tm-kb-settings-hint">{t('knowledgePage.settings.hints.watchRulesChanged')}</p>
      ) : null}
    </div>
  )
}

type NetworkWatchProps = Pick<
  KnowledgeBaseSettingsModalState,
  't' | 'kb' | 'urlRefreshIntervalHours' | 'setUrlRefreshIntervalHours'
>

export function KnowledgeBaseSettingsNetworkWatchTab({
  t,
  kb,
  urlRefreshIntervalHours,
  setUrlRefreshIntervalHours,
}: NetworkWatchProps) {
  return (
    <div className="tm-kb-settings-form">
      <div className="tm-kb-settings-row">
        <FormLabel hint={t('knowledgePage.settings.watch.refreshIntervalHint')}>
          {t('knowledgePage.settings.refreshInterval')}
        </FormLabel>
        <input
          className="tm-kb-settings-input"
          type="number"
          min={0}
          value={urlRefreshIntervalHours}
          onChange={(event) => setUrlRefreshIntervalHours(event.target.value)}
          placeholder="0"
        />
      </div>
      {kb.watchConfig.lastUrlRefreshAt ? (
        <p className="tm-kb-settings-hint">
          {t('knowledgePage.settings.hints.lastRefresh', {
            time: new Date(kb.watchConfig.lastUrlRefreshAt).toLocaleString(),
          })}
        </p>
      ) : null}
    </div>
  )
}
