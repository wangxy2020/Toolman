import { useCallback, useMemo } from 'react'
import type { AppLanguage } from './app-settings'
import type { MessageSettings } from '../chat/message-settings'
import type { AppSettings } from './app-settings'
import { useI18n } from '../../i18n/useI18n'
import { DataSettingsPanel } from './DataSettingsPanel'
import { GeneralModelEquipmentPanel } from './GeneralModelEquipmentPanel'
import { ChannelsSettingsPanel } from './ChannelsSettingsPanel'
import { McpSettingsPanel } from './McpSettingsPanel'
import { SkillsSettingsPanel } from './SkillsSettingsPanel'
import { AboutSettingsPanel } from './AboutSettingsPanel'
import { DisplaySettingsPanel } from './DisplaySettingsPanel'
import { ModelServicePanel } from './ModelServicePanel'
import {
  SettingsInput,
  SettingsPageLayout,
  SettingsPlaceholder,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
} from './SettingsShared'
import type { SettingsSectionId } from './settings-nav'
import { QuickPhrasesSettingsPanel } from './QuickPhrasesSettingsPanel'
import { DiagnosticsSettingsPanel } from './DiagnosticsSettingsPanel'

interface Props {
  section: SettingsSectionId
  workspaceId: string | null
  appSettings: AppSettings
  messageSettings: MessageSettings
  onAppSettingsChange: (patch: Partial<AppSettings>) => void
  onMessageSettingsChange: (patch: Partial<MessageSettings>) => void
  onProvidersSaved?: () => void
}

export function SettingsPanelContent({
  section,
  workspaceId,
  appSettings,
  messageSettings,
  onAppSettingsChange,
  onMessageSettingsChange,
  onProvidersSaved,
}: Props) {
  const { t } = useI18n()
  const patchApp = useCallback(
    (patch: Partial<AppSettings>) => onAppSettingsChange(patch),
    [onAppSettingsChange],
  )

  const languageOptions = useMemo(
    (): { value: AppLanguage; label: string }[] => [
      { value: 'zh-CN', label: t('language.zhCN') },
      { value: 'en', label: t('language.en') },
    ],
    [t],
  )

  const shortcuts = useMemo(
    () => [
      { keys: '⌘ + N', action: t('settings.shortcuts.newSession') },
      { keys: '⌘ + K', action: t('settings.shortcuts.openSearch') },
      { keys: '⌘ + ,', action: t('settings.shortcuts.openSettings') },
      { keys: '⌘ + Enter', action: t('settings.shortcuts.sendMessage') },
      { keys: 'Esc', action: t('settings.shortcuts.closeOrCancel') },
    ],
    [t],
  )

  const content = (() => {
    switch (section) {
    case 'general':
      return (
        <SettingsPageLayout>
          <SettingsSection title={t('settings.general.title')}>
            <SettingsRow label={t('settings.general.language')} hint={t('settings.general.languageHint')}>
              <SettingsSelect
                compact
                value={appSettings.language}
                options={languageOptions}
                onChange={(language) => patchApp({ language })}
              />
            </SettingsRow>
            <SettingsRow
              label={t('settings.general.restoreSession')}
              hint={t('settings.general.restoreSessionHint')}
            >
              <SettingsToggle
                checked={appSettings.restoreLastSession}
                onChange={(restoreLastSession) => patchApp({ restoreLastSession })}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.general.spellCheck')} hint={t('settings.general.spellCheckHint')}>
              <SettingsToggle
                checked={appSettings.spellCheckEnabled}
                onChange={(spellCheckEnabled) => patchApp({ spellCheckEnabled })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            title={t('settings.general.modelEquipment.title')}
            intro={t('settings.general.modelEquipment.intro')}
          >
            <GeneralModelEquipmentPanel workspaceId={workspaceId} />
          </SettingsSection>
        </SettingsPageLayout>
      )

    case 'display':
      return (
        <DisplaySettingsPanel
          appSettings={appSettings}
          messageSettings={messageSettings}
          onAppSettingsChange={onAppSettingsChange}
          onMessageSettingsChange={onMessageSettingsChange}
        />
      )

    case 'model-service':
      if (!workspaceId) {
        return (
          <SettingsPlaceholder
            title={t('settings.modelService.title')}
            description={t('settings.modelService.loading')}
          />
        )
      }
      return <ModelServicePanel workspaceId={workspaceId} onSaved={onProvidersSaved} />

    case 'data':
      return <DataSettingsPanel />

    case 'mcp':
      return <McpSettingsPanel />

    case 'skills':
      return <SkillsSettingsPanel />

    case 'web-search':
      return (
        <SettingsSection title={t('settings.webSearch.title')}>
          <SettingsRow label={t('settings.webSearch.enable')} hint={t('settings.webSearch.enableHint')}>
            <SettingsToggle
              checked={appSettings.webSearchEnabled}
              onChange={(webSearchEnabled) => patchApp({ webSearchEnabled })}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.webSearch.provider')}>
            <SettingsSelect
              value={appSettings.webSearchProvider}
              options={[
                { value: 'duckduckgo', label: 'DuckDuckGo' },
                { value: 'bing', label: 'Bing' },
                { value: 'google', label: 'Google' },
              ]}
              onChange={(webSearchProvider) => patchApp({ webSearchProvider })}
            />
          </SettingsRow>
        </SettingsSection>
      )

    case 'memory':
      return (
        <SettingsSection title={t('settings.memory.title')}>
          <SettingsRow label={t('settings.memory.enable')} hint={t('settings.memory.enableHint')}>
            <SettingsToggle
              checked={appSettings.memoryEnabled}
              onChange={(memoryEnabled) => patchApp({ memoryEnabled })}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.memory.retentionDays')}>
            <SettingsInput
              type="number"
              min={1}
              value={appSettings.memoryRetentionDays}
              onChange={(v) => patchApp({ memoryRetentionDays: Number(v) || 30 })}
            />
          </SettingsRow>
        </SettingsSection>
      )

    case 'channels':
      return <ChannelsSettingsPanel workspaceId={workspaceId} />

    case 'documents':
      return (
        <SettingsSection title={t('settings.documents.title')}>
          <SettingsRow label={t('settings.documents.ocr')} hint={t('settings.documents.ocrHint')}>
            <SettingsToggle
              checked={appSettings.documentOcrEnabled}
              onChange={(documentOcrEnabled) => patchApp({ documentOcrEnabled })}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.documents.pdfParser')}>
            <select
              className="tm-settings-select tm-settings-select--pdf-parser"
              value={appSettings.pdfParserBackend}
              onChange={(event) =>
                patchApp({
                  pdfParserBackend:
                    event.target.value === 'opendataloader' ? 'opendataloader' : 'builtin',
                })
              }
            >
              <option value="builtin">{t('settings.documents.builtInParser')}</option>
              <option value="opendataloader">{t('settings.documents.openDataLoaderParser')}</option>
            </select>
          </SettingsRow>
          <SettingsRow
            label={t('settings.documents.odlHybrid')}
            hint={t('settings.documents.odlHybridHint')}
          >
            <SettingsToggle
              checked={appSettings.odlHybrid.enabled}
              onChange={(enabled) =>
                patchApp({
                  odlHybrid: { ...appSettings.odlHybrid, enabled },
                  ...(enabled ? { pdfParserBackend: 'opendataloader' as const } : {}),
                })
              }
            />
          </SettingsRow>
          {appSettings.odlHybrid.enabled ? (
                <>
                  <SettingsRow label={t('settings.documents.odlHybridBackend')}>
                    <select
                      className="tm-settings-select tm-settings-select--pdf-parser"
                      value={appSettings.odlHybrid.backend}
                      onChange={(event) =>
                        patchApp({
                          odlHybrid: {
                            ...appSettings.odlHybrid,
                            backend:
                              event.target.value === 'docling-fast' ? 'docling-fast' : 'hancom-ai',
                          },
                        })
                      }
                    >
                      <option value="docling-fast">
                        {t('settings.documents.odlHybridBackendDocling')}
                      </option>
                      <option value="hancom-ai">
                        {t('settings.documents.odlHybridBackendHancom')}
                      </option>
                    </select>
                  </SettingsRow>
                  <SettingsRow label={t('settings.documents.odlHybridUrl')}>
                    <SettingsInput
                      value={appSettings.odlHybrid.url}
                      onChange={(url) =>
                        patchApp({ odlHybrid: { ...appSettings.odlHybrid, url } })
                      }
                    />
                  </SettingsRow>
                  <SettingsRow label={t('settings.documents.odlHybridMode')}>
                    <select
                      className="tm-settings-select tm-settings-select--pdf-parser"
                      value={appSettings.odlHybrid.mode}
                      onChange={(event) =>
                        patchApp({
                          odlHybrid: {
                            ...appSettings.odlHybrid,
                            mode: event.target.value === 'full' ? 'full' : 'auto',
                          },
                        })
                      }
                    >
                      <option value="auto">{t('settings.documents.odlHybridModeAuto')}</option>
                      <option value="full">{t('settings.documents.odlHybridModeFull')}</option>
                    </select>
                  </SettingsRow>
                  {appSettings.odlHybrid.backend === 'hancom-ai' ? (
                    <SettingsRow label={t('settings.documents.odlHybridOcrStrategy')}>
                      <select
                        className="tm-settings-select tm-settings-select--pdf-parser"
                        value={appSettings.odlHybrid.hancomAiOcrStrategy}
                        onChange={(event) => {
                          const value = event.target.value
                          const hancomAiOcrStrategy =
                            value === 'off' || value === 'force' ? value : 'auto'
                          patchApp({
                            odlHybrid: { ...appSettings.odlHybrid, hancomAiOcrStrategy },
                          })
                        }}
                      >
                        <option value="off">{t('settings.documents.odlHybridOcrOff')}</option>
                        <option value="auto">{t('settings.documents.odlHybridOcrAuto')}</option>
                        <option value="force">{t('settings.documents.odlHybridOcrForce')}</option>
                      </select>
                    </SettingsRow>
                  ) : null}
                </>
          ) : null}
        </SettingsSection>
      )

    case 'quick-phrases':
      return <QuickPhrasesSettingsPanel />

    case 'shortcuts':
      return (
        <SettingsSection title={t('settings.shortcuts.title')}>
          {shortcuts.map((item) => (
            <div key={item.keys} className="tm-display-row">
              <span className="tm-settings-shortcut-keys">{item.keys}</span>
              <span className="tm-settings-shortcut-action">{item.action}</span>
            </div>
          ))}
        </SettingsSection>
      )

    case 'diagnostics':
      return <DiagnosticsSettingsPanel />

    case 'about':
      return <AboutSettingsPanel />

    default:
      return null
    }
  })()

  return <SettingsPageLayout>{content}</SettingsPageLayout>
}
