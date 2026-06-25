import { describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send },
      },
    ],
  },
}))

import { IpcChannel } from '@toolman/shared'
import { addStreamRelayListener, broadcastStreamEvent } from './stream-broadcast'

describe('stream-broadcast', () => {
  it('notifies relay listeners and renderer windows', () => {
    const events: unknown[] = []
    const unsubscribe = addStreamRelayListener((event) => events.push(event))
    const payload = {
      type: 'message.delta' as const,
      sessionId: 'session-1',
      messageId: 'msg-1',
      modelId: 'openai/gpt-4o-mini',
      delta: { type: 'text' as const, text: 'hi' },
      timestamp: Date.now(),
    }

    broadcastStreamEvent(payload)
    expect(events).toHaveLength(1)
    expect(send).toHaveBeenCalledWith(IpcChannel.MessageStream, payload)
    unsubscribe()
  })
})
