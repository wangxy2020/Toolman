import type { TtsPlaybackState, TtsProvider } from './tts-types'

/**
 * Async FIFO queue: enqueue sentences → synthesize/play in order.
 * Supports pause / resume / stop.
 */
export class TtsPlaybackQueue {
  private readonly queue: string[] = []
  private pumping = false
  private paused = false
  private abortController: AbortController | null = null
  private onIdle: (() => void) | null = null
  private onStateChange: ((state: TtsPlaybackState) => void) | null = null

  constructor(private readonly provider: TtsProvider) {}

  setOnIdle(handler: (() => void) | null): void {
    this.onIdle = handler
  }

  setOnStateChange(handler: ((state: TtsPlaybackState) => void) | null): void {
    this.onStateChange = handler
  }

  enqueue(sentence: string): void {
    const trimmed = sentence.trim()
    if (!trimmed) return
    this.queue.push(trimmed)
    void this.pump()
  }

  enqueueAll(sentences: string[]): void {
    for (const sentence of sentences) this.enqueue(sentence)
  }

  get size(): number {
    return this.queue.length
  }

  get busy(): boolean {
    return this.pumping || this.queue.length > 0
  }

  get playbackState(): TtsPlaybackState {
    if (!this.busy) return 'idle'
    return this.paused ? 'paused' : 'playing'
  }

  pause(): void {
    if (!this.busy || this.paused) return
    this.paused = true
    this.provider.pause()
    this.onStateChange?.('paused')
  }

  resume(): void {
    if (!this.busy || !this.paused) return
    this.paused = false
    this.provider.resume()
    this.onStateChange?.('playing')
    void this.pump()
  }

  stop(): void {
    this.queue.length = 0
    this.paused = false
    this.abortController?.abort()
    this.abortController = null
    this.provider.cancel()
    this.pumping = false
    this.onStateChange?.('idle')
    this.onIdle?.()
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.paused) return
    this.pumping = true
    this.onStateChange?.('playing')
    try {
      while (this.queue.length > 0 && !this.paused) {
        const sentence = this.queue.shift()
        if (!sentence) continue
        this.abortController = new AbortController()
        const signal = this.abortController.signal
        try {
          await this.provider.speak(sentence, signal)
        } catch {
          if (signal.aborted) break
        }
        if (signal.aborted) break
        this.abortController = null
        if (this.paused) break
      }
    } finally {
      this.pumping = false
      if (!this.busy) {
        this.paused = false
        this.onStateChange?.('idle')
        this.onIdle?.()
      } else if (this.paused) {
        this.onStateChange?.('paused')
      }
    }
  }
}
