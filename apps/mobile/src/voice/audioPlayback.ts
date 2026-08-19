import { getSharedAudioElement, SILENT_WAV } from './audioUnlock'

/**
 * Controllable HTMLAudioElement playback for Edge TTS MP3 blobs (web / RN-web).
 */
export class ControllableAudioPlayback {
  private audio: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private resolveWait: (() => void) | null = null
  private abortHandler: (() => void) | null = null
  private signal: AbortSignal | null = null
  private closed = false

  play(blob: Blob, signal: AbortSignal): Promise<void> {
    if (typeof Audio === 'undefined') {
      return Promise.reject(new Error('当前环境不支持音频播放'))
    }
    this.cleanup(false)
    const previousUrl = this.objectUrl
    this.objectUrl = null
    this.closed = false
    if (signal.aborted) {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const audio = getSharedAudioElement() ?? new Audio()
      audio.muted = false
      audio.preload = 'auto'
      audio.src = url
      if (previousUrl) URL.revokeObjectURL(previousUrl)
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
    void this.audio.play().catch(() => undefined)
  }

  stop(): void {
    if (this.closed) {
      this.cleanup(true)
      return
    }
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
        // Shared element must stay unlocked. `removeAttribute('src')` + `load()`
        // re-locks Chrome autoplay and kills the next Edge TTS play() after fetch.
        if (revoke) {
          audio.src = SILENT_WAV
        }
      } catch {
        // ignore
      }
    }

    if (revoke && this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }
}
