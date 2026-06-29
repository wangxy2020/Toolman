import type { Provider } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/I18nProvider'
import type { ProviderPreset } from './provider-presets'
import { openExternal } from './provider-config-icons'

interface Props {
  t: TranslateFn
  preset: ProviderPreset
  presetName: string
  provider: Provider | null
  busy: boolean
  onDeleteProvider: () => void
}

export function ProviderConfigCardFooter({
  t,
  preset,
  presetName,
  provider,
  busy,
  onDeleteProvider,
}: Props) {
  return (
    <footer className="tm-provider-footer">
      <span>
        {t('settings.providers.footer.view')}{' '}
        <button type="button" className="tm-provider-link" onClick={() => openExternal(preset.docUrl)}>
          {t('settings.providers.footer.providerDocs', { name: presetName })}
        </button>{' '}
        {t('settings.providers.footer.and')}{' '}
        <button
          type="button"
          className="tm-provider-link"
          onClick={() => openExternal(preset.modelsDocUrl)}
        >
          {t('settings.providers.footer.modelsLink')}
        </button>{' '}
        {t('settings.providers.footer.moreDetails')}
      </span>
      {!preset.locked && provider ? (
        <button
          type="button"
          className="tm-provider-link tm-provider-link--danger"
          disabled={busy}
          onClick={() => void onDeleteProvider()}
        >
          {t('settings.providers.remove.action')}
        </button>
      ) : null}
    </footer>
  )
}
