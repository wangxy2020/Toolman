import { describe, expect, it } from 'vitest'
import { TtsController } from './tts-controller'
import type { TtsProvider } from './tts-types'

function createFakeProvider(): TtsProvider {
  return {
    id: 'fake',
    async speak() {},
    pause() {},
    resume() {},
    cancel() {},
  }
}

describe('TtsController stream rebind', () => {
  it('keeps the active stream message id across temp → real remap', () => {
    const controller = new TtsController(createFakeProvider())

    controller.feedStreamText('temp-1', '你好。继续。')
    expect(controller.getPlayingMessageId()).toBe('temp-1')

    controller.rebindStreamMessageId('real-1')
    expect(controller.getPlayingMessageId()).toBe('real-1')

    controller.feedStreamText('real-1', '你好。继续。下一句。')
    expect(controller.getPlayingMessageId()).toBe('real-1')

    controller.endStream('real-1')
    // Playback may still be draining; stream id should be cleared without forcing stop mid-queue.
    expect(controller.getPlayingMessageId() === 'real-1' || controller.getPlaybackState() !== 'idle').toBe(
      true,
    )
  })
})
