import { useCallback, useEffect, useMemo, useState } from 'react'
import { IpcChannel, type Provider } from '@toolman/shared'

import { buildModelOptions } from '../chat/model-utils'
import { useI18n } from '../../i18n/useI18n'
import { SettingsRow, SettingsSelect } from './SettingsShared'

interface Props {
  workspaceId: string | null
  plannerModelId: string
  onChange: (plannerModelId: string) => void
}

export function PlannerModelSettingsRow({ workspaceId, plannerModelId, onChange }: Props) {
  const { t } = useI18n()
  const [providers, setProviders] = useState<Provider[]>([])

  const loadProviders = useCallback(async () => {
    if (!workspaceId) {
      setProviders([])
      return
    }

    const result = await window.api.invoke(IpcChannel.ProviderList, { workspaceId })
    if (result.ok) {
      setProviders(result.data as Provider[])
    }
  }, [workspaceId])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const modelOptions = useMemo(() => {
    const chatModels = buildModelOptions(providers)
    return [
      { value: '', label: t('settings.general.plannerModel.sameAsDefault') },
      ...chatModels.map((option) => ({ value: option.modelId, label: option.label })),
    ]
  }, [providers, t])

  return (
    <SettingsRow
      label={t('settings.general.plannerModel.label')}
      hint={t('settings.general.plannerModel.hint')}
    >
      <SettingsSelect
        compact
        value={plannerModelId}
        options={modelOptions}
        onChange={onChange}
      />
    </SettingsRow>
  )
}
