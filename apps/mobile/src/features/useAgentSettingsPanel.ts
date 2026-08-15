import { useState } from 'react'
import { probeModelApi } from '../chat/probeModel'
import { sanitizeApiKey } from '../chat/apiHeaders'
import { saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import {
  getProviderPreset,
  normalizeChatBaseUrl,
  type MobileProviderId,
} from '../settings/provider-presets'
import { saveModelConfig } from '../storage/secure'
import { useMobileApp } from '../state/MobileAppContext'
import { resolveCuratedEdgeTtsVoice } from '../voice'
import { describeApiKey } from './settingsPaneUtils'

export function useAgentSettingsPanel() {
  const { modelConfig, setModelConfig, modulePrefs, setModulePrefs } = useMobileApp()
  const [providerId, setProviderId] = useState<MobileProviderId>(
    (modelConfig.providerId as MobileProviderId) || 'deepseek',
  )
  const [baseUrl, setBaseUrl] = useState(modelConfig.baseUrl)
  const [apiKey, setApiKey] = useState(modelConfig.apiKey)
  const [model, setModel] = useState(modelConfig.model)
  const [localModelEnabled, setLocalModelEnabled] = useState(modelConfig.localModelEnabled)
  const [message, setMessage] = useState<string | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeOk, setProbeOk] = useState<boolean | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const prefs = modulePrefs.agent
  const preset = getProviderPreset(providerId)

  const applyProvider = (id: MobileProviderId) => {
    const next = getProviderPreset(id)
    setProviderId(id)
    setBaseUrl(next.defaultBaseUrl)
    if (next.defaultModel) setModel(next.defaultModel)
    setProbeOk(null)
  }

  const buildDraftConfig = () => ({
    providerId,
    baseUrl: normalizeChatBaseUrl(baseUrl.trim(), providerId),
    apiKey: sanitizeApiKey(apiKey),
    model: model.trim() || preset.defaultModel,
    localModelEnabled,
  })

  const saveModel = async () => {
    const next = buildDraftConfig()
    await saveModelConfig(next)
    setModelConfig(next)
    setBaseUrl(next.baseUrl)
    setModel(next.model)
    setMessage(`已保存 · ${preset.name}`)
  }

  const runProbe = async () => {
    setProbeBusy(true)
    setProbeOk(null)
    const draft = buildDraftConfig()
    setMessage(`正在检测…（${describeApiKey(draft.apiKey)}）`)
    const result = await probeModelApi(draft)
    setProbeBusy(false)
    setProbeOk(result.ok)
    setMessage(
      result.ok
        ? result.message
        : `${result.message}\n当前 Key：${describeApiKey(draft.apiKey)}。若尾号与控制台不一致，请清空后重新粘贴完整密钥并先「保存模型」。`,
    )
  }

  const patchPrefs = async (patch: Partial<ModulePrefs['agent']>) => {
    const next = { ...modulePrefs, agent: { ...prefs, ...patch } }
    setModulePrefs(next)
    await saveModulePrefs(next)
    setMessage('模型服务偏好已保存')
  }

  return {
    providerId,
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    model,
    setModel,
    localModelEnabled,
    setLocalModelEnabled,
    message,
    probeBusy,
    probeOk,
    showApiKey,
    setShowApiKey,
    prefs,
    preset,
    applyProvider,
    saveModel,
    runProbe,
    patchPrefs,
    apiKeyDescription: describeApiKey(apiKey),
    patchTtsVoice: (value: string) =>
      void patchPrefs({ ttsVoice: resolveCuratedEdgeTtsVoice(value) }),
  }
}
