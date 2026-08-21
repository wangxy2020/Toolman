import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRIAL_LLM_UNCONFIGURED_MESSAGE } from '@toolman/shared'
import { parseLlmProxyChatBody } from './llmProxyRequest'
import { allowTrialLlmRate, proxyChatCompletion, resetTrialLlmRateLimitForTests } from './llmProxyServer'

describe('trial llm proxy server', () => {
  afterEach(() => {
    resetTrialLlmRateLimitForTests()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('rate-limits a device to 3 requests per minute', () => {
    expect(allowTrialLlmRate('dev-1', 1_000)).toBe(true)
    expect(allowTrialLlmRate('dev-1', 1_001)).toBe(true)
    expect(allowTrialLlmRate('dev-1', 1_002)).toBe(true)
    expect(allowTrialLlmRate('dev-1', 1_003)).toBe(false)
    expect(allowTrialLlmRate('dev-2', 1_003)).toBe(true)
    expect(allowTrialLlmRate('dev-1', 1_000 + 60_001)).toBe(true)
  })

  it('rejects trial requests when the server key is missing', async () => {
    vi.stubEnv('TOOLMAN_TRIAL_DEEPSEEK_API_KEY', '')
    const parsed = parseLlmProxyChatBody({
      trial: true,
      deviceId: 'dev-1',
      messages: [{ role: 'user', content: 'hi' }],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    const result = await proxyChatCompletion(parsed)
    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({
      error: TRIAL_LLM_UNCONFIGURED_MESSAGE,
      code: 'TRIAL_UNCONFIGURED',
    })
  })

  it('does not send a client-supplied key or URL in trial mode', async () => {
    vi.stubEnv('TOOLMAN_TRIAL_DEEPSEEK_API_KEY', 'sk-server-trial')
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const parsed = parseLlmProxyChatBody({
      trial: true,
      deviceId: 'dev-9',
      baseUrl: 'https://evil.example/v1',
      apiKey: 'sk-stolen',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'hi' }],
    })
    if ('error' in parsed) throw new Error(parsed.error)
    await proxyChatCompletion(parsed)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls.at(0)
    expect(firstCall).toBeDefined()
    const [url, init] = firstCall as unknown as [string, { headers: { Authorization: string }; body: string }]
    expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer sk-server-trial')
    const body = JSON.parse(init.body) as { model: string }
    expect(body.model).toBe('deepseek-v4-flash')
  })
})
