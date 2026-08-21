import { useEffect, useState } from 'react'
import {
  remainingTrialConversations,
  remainingTrialTokens,
  type TrialQuotaState,
} from '@toolman/shared'
import { probeModelApi } from '../chat/probeModel'
import { shouldUseTrialLlm } from '../chat/trialLlm'
import { sanitizeApiKey } from '../chat/apiHeaders'
import { saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import {
  getProviderPreset,
  normalizeChatBaseUrl,
  type MobileProviderId,
} from '../settings/provider-presets'
import { saveModelConfig } from '../storage/secure'
import { loadTrialQuota } from '../storage/trialLlmQuota'
import {
  readProviderCredential,
  upsertProviderCredentials,
} from '../storage/providerCredentials'
import { useMobileApp } from '../state/MobileAppContext'

export function useAgentSettingsPanel() {
  const { modelConfig, setModelConfig, modulePrefs, setModulePrefs } = useMobileApp()
  const [providerId, setProviderId] = useState<MobileProviderId>(
    (modelConfig.providerId as MobileProviderId) || 'deepseek',
  )
  const [baseUrl, setBaseUrl] = useState(modelConfig.baseUrl)
  const [apiKey, setApiKey] = useState(modelConfig.apiKey)
  const [model, setModel] = useState(modelConfig.model)
  const [localModelEnabled, setLocalModelEnabled] = useState(modelConfig.localModelEnabled)
  const [credentialsByProvider, setCredentialsByProvider] = useState(
    modelConfig.credentialsByProvider ?? {},
  )
  const [message, setMessage] = useState<string | null>(null)
  const [probeBusy, setProbeBusy] = useState(false)
  const [probeOk, setProbeOk] = useState<boolean | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [trialQuota, setTrialQuota] = useState<TrialQuotaState | null>(null)
  const prefs = modulePrefs.agent
  const preset = getProviderPreset(providerId)
  const trialActive = shouldUseTrialLlm({ apiKey })

  useEffect(() => {
    if (!trialActive) {
      setTrialQuota(null)
      return
    }
    void loadTrialQuota().then(setTrialQuota)
  }, [trialActive, message])

  const applyProvider = (id: MobileProviderId) => {
    const next = getProviderPreset(id)
    const stashed = upsertProviderCredentials(credentialsByProvider, providerId, {
      apiKey,
      baseUrl,
      model,
    })
    const stored = readProviderCredential(stashed, id)
    setCredentialsByProvider(stashed)
    setProviderId(id)
    setBaseUrl(stored?.baseUrl || next.defaultBaseUrl)
    setApiKey(stored?.apiKey ?? '')
    setModel(stored?.model || next.defaultModel)
    setShowApiKey(false)
    setProbeOk(null)
    setMessage(null)
  }

  const buildDraftConfig = () => {
    const nextUrl = normalizeChatBaseUrl(baseUrl.trim(), providerId)
    const nextKey = sanitizeApiKey(apiKey)
    const nextModel = model.trim() || preset.defaultModel
    return {
      providerId,
      baseUrl: nextUrl,
      apiKey: nextKey,
      model: nextModel,
      localModelEnabled,
      credentialsByProvider: upsertProviderCredentials(credentialsByProvider, providerId, {
        apiKey: nextKey,
        baseUrl: nextUrl,
        model: nextModel,
      }),
    }
  }

  const saveModel = async () => {
    const next = buildDraftConfig()
    await saveModelConfig(next)
    setModelConfig(next)
    setCredentialsByProvider(next.credentialsByProvider ?? {})
    setBaseUrl(next.baseUrl)
    setModel(next.model)
    setMessage(`已保存 · ${preset.name}`)
  }

  const runProbe = async () => {
    setProbeBusy(true)
    setProbeOk(null)
    const draft = buildDraftConfig()
    setMessage('正在检测…')
    const result = await probeModelApi(draft)
    setProbeBusy(false)
    setProbeOk(result.ok)
    setMessage(result.message)
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
    trialActive,
    trialRemainingConversations: trialQuota ? remainingTrialConversations(trialQuota) : null,
    trialRemainingTokens: trialQuota ? remainingTrialTokens(trialQuota) : null,
  }
}
