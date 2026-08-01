/**
 * Capture a user gesture so HTMLAudioElement can play after async Edge TTS IPC.
 * Safe to call repeatedly; no-ops after the first successful unlock.
 */
let unlocked = false

export function unlockAudioPlayback(): void {
  if (unlocked || typeof window === 'undefined') return

  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor()
      void ctx.resume().catch(() => undefined)
      const gain = ctx.createGain()
      gain.gain.value = 0
      const osc = ctx.createOscillator()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(0)
      osc.stop(0)
      void ctx.close().catch(() => undefined)
    }
  } catch {
    // ignore
  }

  try {
    const probe = new Audio()
    probe.muted = true
    void probe
      .play()
      .then(() => {
        probe.pause()
        unlocked = true
      })
      .catch(() => undefined)
  } catch {
    // ignore
  }

  unlocked = true
}
