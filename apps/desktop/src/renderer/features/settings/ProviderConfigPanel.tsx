import type { Provider } from '@toolman/shared'
import { AddModelModal } from './AddModelModal'
import { ApiKeySettingsModal } from './ApiKeySettingsModal'
import { EditModelModal } from './EditModelModal'
import { ModelPickerModal } from './ModelPickerModal'
import type { ProviderPreset } from './provider-presets'
import { ProviderConfigCard } from './ProviderConfigCard'
import { useProviderConfigPanel } from './useProviderConfigPanel'

interface Props {
  workspaceId: string
  preset: ProviderPreset
  provider: Provider | null
  providers: Provider[]
  onChanged: () => void
}

export function ProviderConfigPanel({ workspaceId, preset, provider, providers, onChanged }: Props) {
  const panel = useProviderConfigPanel({ workspaceId, preset, provider, providers, onChanged })

  return (
    <>
      <ProviderConfigCard preset={preset} provider={provider} panel={panel} />

      {panel.pickerOpen && panel.pickerProvider && (
        <ModelPickerModal
          provider={panel.pickerProvider}
          preset={preset}
          installedModels={panel.models}
          onClose={() => {
            panel.setPickerOpen(false)
            panel.setPickerProvider(null)
          }}
          onSave={panel.handleSaveModels}
        />
      )}

      {panel.addOpen && (
        <AddModelModal presetId={preset.id} onClose={() => panel.setAddOpen(false)} onAdd={panel.handleAddModel} />
      )}

      {panel.editingModel && (
        <EditModelModal
          model={panel.editingModel}
          onClose={() => panel.setEditingModel(null)}
          onSave={panel.handleEditModel}
        />
      )}

      {panel.apiKeySettingsOpen && (
        <ApiKeySettingsModal
          hasApiKey={provider?.hasApiKey ?? false}
          apiKeyRotate={provider?.apiKeyRotate ?? false}
          onClose={() => panel.setApiKeySettingsOpen(false)}
          onSave={panel.handleApiKeySettingsSave}
        />
      )}
    </>
  )
}
