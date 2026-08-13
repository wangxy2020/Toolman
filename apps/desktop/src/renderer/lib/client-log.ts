import { isReleaseDesktopBuild } from '../env/release-build'

function emit(level: 'info' | 'warn' | 'error', message: string, extra?: unknown): void {
  if (isReleaseDesktopBuild()) return
  if (extra !== undefined) {
    console[level](message, extra)
    return
  }
  console[level](message)
}

/** Renderer diagnostics. No-ops in release builds (`TOOLMAN_RELEASE_BUILD=1`). */
export const clientLog = {
  info: (message: string, extra?: unknown) => emit('info', message, extra),
  warn: (message: string, extra?: unknown) => emit('warn', message, extra),
  error: (message: string, extra?: unknown) => emit('error', message, extra),
}
