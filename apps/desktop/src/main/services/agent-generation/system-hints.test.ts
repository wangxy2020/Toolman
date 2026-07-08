import { describe, expect, it, vi } from 'vitest'

vi.mock('../provider/crud', () => ({
  getProviderRow: vi.fn(),
}))

import { getProviderRow } from '../provider/crud'
import { buildRuntimeModelIdentityHint } from './system-hints'

describe('buildRuntimeModelIdentityHint', () => {
  it('includes current model and warns against stale history identity', () => {
    vi.mocked(getProviderRow).mockReturnValue({
      name: 'Ollama',
    } as never)

    const hint = buildRuntimeModelIdentityHint(
      '00000000-0000-0000-0000-000000000004:qwen3.5:9b',
    )

    expect(hint).toContain('qwen3.5:9b（Ollama）')
    expect(hint).toContain('当前推理模型')
    expect(hint).toContain('不要复述对话历史中其他模型')
  })
})
