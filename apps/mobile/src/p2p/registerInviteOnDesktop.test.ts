import { describe, expect, it } from 'vitest'
import { listRegisterHubCandidates } from './registerHubs'

describe('listRegisterHubCandidates', () => {
  it('keeps private hubs and drops public ones', () => {
    expect(
      listRegisterHubCandidates(
        ['http://192.168.1.8:17890', 'https://hub.toolman.app'],
        'http://100.64.1.8:17890',
      ),
    ).toEqual(['http://192.168.1.8:17890', 'http://100.64.1.8:17890'])
  })
})
