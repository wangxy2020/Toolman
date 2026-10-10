import { describe, expect, it } from 'vitest'
import {
  encodePersonalSignalWire,
  readPersonalSignalWire,
  readXirsysOkString,
  xirsysSignalSocketUrl,
  xirsysSignalTokenUrl,
} from './xirsys-signal.js'

describe('xirsys personal signal', () => {
  it('builds a socket url without doubling /v2', () => {
    expect(xirsysSignalSocketUrl('wss://signal.example/ws', 'tok/en')).toBe(
      'wss://signal.example/ws/v2/tok%2Fen',
    )
    expect(xirsysSignalSocketUrl('wss://signal.example/v2/', 'abc')).toBe(
      'wss://signal.example/v2/abc',
    )
  })

  it('puts the peer id on the token url', () => {
    expect(xirsysSignalTokenUrl('https://global.xirsys.net', 'room', 'phone 1', 60)).toBe(
      'https://global.xirsys.net/_token/room?k=phone%201&expire=60',
    )
  })

  it('reads host strings and nested host fields', () => {
    expect(readXirsysOkString({ s: 'ok', v: 'wss://signal.example/ws' })).toBe(
      'wss://signal.example/ws',
    )
    expect(readXirsysOkString({ s: 'ok', v: { host: 'wss://nested' } })).toBe('wss://nested')
    expect(readXirsysOkString({ s: 'error', v: 'nope' })).toBeNull()
  })

  it('round-trips a directed sealed payload and drops other traffic', () => {
    const raw = encodePersonalSignalWire({
      from: 'desk',
      to: 'phone',
      ciphertextB64: 'Y2lwaGVy',
    })
    expect(readPersonalSignalWire(raw, 'phone')).toEqual({
      from: 'desk',
      ciphertextB64: 'Y2lwaGVy',
    })
    expect(readPersonalSignalWire(raw, 'desk')).toBeNull()
    expect(readPersonalSignalWire(raw, 'other')).toBeNull()
    expect(readPersonalSignalWire(JSON.stringify({ t: 'u', m: { f: 'desk', o: 'other' } }), 'phone')).toBeNull()
  })
})
