import { describe, expect, it } from 'vitest'

import { wrapProviderFetchError } from './utils.js'

describe('wrapProviderFetchError', () => {
  it('maps fetch failed to a friendly ollama message', () => {
    const error = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    expect(wrapProviderFetchError({ type: 'ollama' }, error).message).toContain('Ollama')
    expect(wrapProviderFetchError({ type: 'ollama' }, error).message).toContain('ollama serve')
  })
})
