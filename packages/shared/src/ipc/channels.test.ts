import { describe, expect, it } from 'vitest'
import {
  IpcChannel,
  isIpcInvokeChannel,
  isIpcSubscribeChannel,
  APP_UPDATE_STATUS_CHANNEL,
  NOTES_MOBILE_SYNC_CHANNEL,
} from './channels'
import { IPC_CHANNEL_CONTRACT, isIpcContractChannel } from './contract.js'

describe('IPC channel allowlists', () => {
  it('accepts registered invoke channels and rejects others', () => {
    expect(isIpcInvokeChannel(IpcChannel.AppGetInfo)).toBe(true)
    expect(isIpcInvokeChannel(IpcChannel.NotesSyncExport)).toBe(true)
    expect(isIpcInvokeChannel(IpcChannel.ClassroomSyncSetEnabled)).toBe(true)
    expect(isIpcInvokeChannel('classroom:sync:set-enabled')).toBe(true)
    expect(isIpcInvokeChannel('not-a-channel')).toBe(false)
    expect(isIpcInvokeChannel('electron-internal')).toBe(false)
  })

  it('accepts known subscribe channels and rejects others', () => {
    expect(isIpcSubscribeChannel(IpcChannel.MessageStream)).toBe(true)
    expect(isIpcSubscribeChannel(APP_UPDATE_STATUS_CHANNEL)).toBe(true)
    expect(isIpcSubscribeChannel(NOTES_MOBILE_SYNC_CHANNEL)).toBe(true)
    expect(isIpcSubscribeChannel('p2p:member:changed')).toBe(true)
    expect(isIpcSubscribeChannel('arbitrary:event')).toBe(false)
  })

  it('keeps every contract channel on the invoke allowlist', () => {
    for (const channel of Object.keys(IPC_CHANNEL_CONTRACT)) {
      expect(isIpcContractChannel(channel)).toBe(true)
      expect(isIpcInvokeChannel(channel)).toBe(true)
    }
  })
})
