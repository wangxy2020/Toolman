import type { ModelConfig } from '../state/MobileAppContext'
import { normalizeChatBaseUrl } from '../settings/provider-presets'
import { buildApiAuthHeaders } from './apiHeaders'

export type ModelProbeResult = {
  ok: boolean
  message: string
}

function formatProviderError(status: number, body: string): string {
  const trimmed = body.trim()
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string; code?: string | number; type?: string }
      message?: string
      msg?: string
    }
    const message =
      parsed.error?.message?.trim() ||
      parsed.message?.trim() ||
      parsed.msg?.trim()
    if (message) return message
  } catch {
    // ignore
  }
  if (trimmed) return trimmed.slice(0, 200)
  return `HTTP ${status}`
}

function authHint(status: number, detail: string): string {
  const lower = detail.toLowerCase()
  if (status === 401 || status === 403 || /invalid.?api.?key|unauthorized|authentication/i.test(lower)) {
    return `鉴权失败 (${status})：${detail}。请确认 API Key 完整、未过期，且 Base URL 与服务商一致。`
  }
  return `检测失败 (${status})：${detail}`
}

/**
 * Probe OpenAI-compatible API — mirrors desktop `testOpenAiConnection`:
 * a 1-token chat ping (do not use GET /models; Moonshot listing is slow).
 */
export async function probeModelApi(config: ModelConfig): Promise<ModelProbeResult> {
  const auth = buildApiAuthHeaders(config.apiKey)
  if (!auth.ok) {
    return { ok: false, message: auth.message }
  }

  const model = config.model.trim()
  if (!model) {
    return { ok: false, message: '请先填写模型 ID' }
  }

  const base = normalizeChatBaseUrl(config.baseUrl, config.providerId).replace(/\/$/, '')
  const { headers } = auth
  const started = Date.now()
  const kimi = /kimi-k\d/i.test(model)

  try {
    const chatRes = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
        ...(kimi ? { thinking: { type: 'disabled' } } : {}),
      }),
    })
    const ms = Date.now() - started
    if (chatRes.ok) {
      return { ok: true, message: `对话接口正常 (${ms}ms) · ${model}` }
    }
    const body = await chatRes.text().catch(() => '')
    const detail = formatProviderError(chatRes.status, body)
    const endpoint = `${base}/chat/completions`
    return {
      ok: false,
      message: `${authHint(chatRes.status, detail)}（请求：${endpoint}）`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('ISO-8859-1') || msg.includes('code point')) {
      return {
        ok: false,
        message: '请求头含非法字符，请重新粘贴纯 ASCII 的 API Key',
      }
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return {
        ok: false,
        message: `无法连接 ${base}（网络/CORS）。若在浏览器中调试，请确认服务商允许跨域，或改用真机/桌面端验证。`,
      }
    }
    return { ok: false, message: msg }
  }
}
