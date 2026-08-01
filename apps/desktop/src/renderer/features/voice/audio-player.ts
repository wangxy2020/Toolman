/**
 * Controllable HTMLAudioElement playback for Edge TTS MP3 blobs.
 * Supports pause / resume / stop while a single sentence is playing.
 *
 * Intentional stop/abort resolves quietly. Real playback failures still reject
 * so FallbackTtsProvider can switch to Web Speech (autoplay / decode issues).
 */
export class ControllableAudioPlayback {
  private audio: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private resolveWait: (() => void) | null = null
  private abortHandler: (() => void) | null = null
  private signal: AbortSignal | null = null
  /** Once true, terminal callbacks are no-ops (stop/abort already settled). */
  private closed = false

  get paused(): boolean {
    return Boolean(this.audio && this.audio.paused && !this.audio.ended && this.audio.currentTime > 0)
  }

  play(blob: Blob, signal: AbortSignal): Promise<void> {
    this.cleanup(false)
    this.closed = false
    if (signal.aborted) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.preload = 'auto'
      this.audio = audio
      this.objectUrl = url
      this.signal = signal
      this.resolveWait = resolve

      const finishOk = () => {
        if (this.closed) return
        this.closed = true
        this.resolveWait = null
        this.cleanup(true)
        resolve()
      }

      const finishErr = (error: Error) => {
        if (this.closed || signal.aborted) {
          finishOk()
          return
        }
        this.closed = true
        this.resolveWait = null
        this.cleanup(true)
        reject(error)
      }

      const onAbort = () => finishOk()
      this.abortHandler = onAbort
      signal.addEventListener('abort', onAbort, { once: true })

      audio.onended = () => finishOk()
      audio.onerror = () => {
        // Teardown (clear src / revoke) often fires `error` after stop — ignore then.
        if (this.closed || signal.aborted) {
          finishOk()
          return
        }
        finishErr(new Error('Audio playback failed'))
      }

      void audio.play().catch((error) => {
        if (this.closed || signal.aborted) {
          finishOk()
          return
        }
        finishErr(error instanceof Error ? error : new Error('Audio play() failed'))
      })
    })
  }

  pause(): void {
    if (this.closed) return
    this.audio?.pause()
  }

  resume(): void {
    if (this.closed || !this.audio || this.audio.ended) return
    void this.audio.play().catch(() => {
      // ignore resume failures
    })
  }

  stop(): void {
    if (this.closed) {
      this.cleanup(true)
      return
    }
    // Mark closed before teardown so onerror / play().catch settle as OK, not failure.
    this.closed = true
    const resolve = this.resolveWait
    this.resolveWait = null
    this.cleanup(true)
    resolve?.()
  }

  private cleanup(revoke: boolean): void {
    if (this.signal && this.abortHandler) {
      this.signal.removeEventListener('abort', this.abortHandler)
    }
    this.abortHandler = null
    this.signal = null

    const audio = this.audio
    this.audio = null
    if (audio) {
      audio.onended = null
      audio.onerror = null
      try {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      } catch {
        // ignore DOM media cleanup races
      }
    }

    if (revoke && this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
    }
    this.objectUrl = null
  }
}
