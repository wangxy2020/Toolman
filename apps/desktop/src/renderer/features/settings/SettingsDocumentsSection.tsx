import type { AppSettings } from './app-settings'
import {
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from './SettingsShared'
import {
  parseHancomOcrStrategy,
  parseOdlHybridBackend,
  parseOdlHybridMode,
  parsePdfParserBackend,
  patchOdlHybridEnabled,
} from './settings-document-patches'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  appSettings: AppSettings
  patchApp: (patch: Partial<AppSettings>) => void
}

export function SettingsDocumentsSection({ appSettings, patchApp }: Props) {
  const { t } = useI18n()

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
            patchApp({ pdfParserBackend: parsePdfParserBackend(event.target.value) })
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
            patchApp(patchOdlHybridEnabled(appSettings.odlHybrid, enabled))
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
                    backend: parseOdlHybridBackend(event.target.value),
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
                    mode: parseOdlHybridMode(event.target.value),
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
                onChange={(event) =>
                  patchApp({
                    odlHybrid: {
                      ...appSettings.odlHybrid,
                      hancomAiOcrStrategy: parseHancomOcrStrategy(event.target.value),
                    },
                  })
                }
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
}
