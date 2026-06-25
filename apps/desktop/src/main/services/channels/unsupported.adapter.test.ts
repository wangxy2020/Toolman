import { describe, expect, it } from 'vitest'

import { UnsupportedChannelAdapter, createUnsupportedAdapters } from './unsupported.adapter'

describe('UnsupportedChannelAdapter', () => {
  it('creates adapters for placeholder platforms', () => {
    const adapters = createUnsupportedAdapters()
    expect(adapters.map((adapter) => adapter.platform)).toEqual(['qq', 'slack'])
  })

  it('validates test config input', async () => {
    const adapter = new UnsupportedChannelAdapter('qq')
    await expect(adapter.test({ appId: '', appSecret: '' } as never)).resolves.toMatchObject({
      ok: false,
    })
    await expect(
      adapter.test({ appId: 'app', appSecret: 'secret' } as never),
    ).resolves.toMatchObject({ ok: true })
  })

  it('rejects unsupported platform ids', () => {
    expect(() => new UnsupportedChannelAdapter('feishu')).toThrow(
      'UnsupportedChannelAdapter 不适用于',
    )
  })
})
