import { describe, expect, it } from 'vitest'

import {
  consoleDedupKey,
  formatDiagnosticForConsole,
} from './diagnostics-log-format'

describe('formatDiagnosticForConsole', () => {
  it('formats provenance app.start with build summary', () => {
    const line = formatDiagnosticForConsole({
      at: 1,
      subsystem: 'provenance',
      level: 'info',
      message:
        'app.start {"buildId":"abc","buildFingerprint":"fp","gitCommit":"e6bbee4","version":"0.2.0-rc.6"}',
    })
    expect(line).toBe('[provenance] App started (v0.2.0-rc.6, commit e6bbee4)')
  })

  it('formats provenance renderer ready', () => {
    const line = formatDiagnosticForConsole({
      at: 1,
      subsystem: 'provenance',
      level: 'info',
      message: 'app.renderer.ready {"gitCommit":"e6bbee4","version":"0.2.0-rc.6"}',
    })
    expect(line).toBe('[provenance] Renderer UI ready (v0.2.0-rc.6, commit e6bbee4)')
  })

  it('formats community hub ready', () => {
    const line = formatDiagnosticForConsole({
      at: 1,
      subsystem: 'community.hub',
      level: 'info',
      message: 'ready at http://127.0.0.1:62086',
    })
    expect(line).toBe('[community] Hub ready at http://127.0.0.1:62086')
  })

  it('prefixes warn and error levels', () => {
    expect(
      formatDiagnosticForConsole({
        at: 1,
        subsystem: 'p2p',
        level: 'warn',
        message: 'connection lost',
      }),
    ).toBe('[p2p] WARN connection lost')

    expect(
      formatDiagnosticForConsole({
        at: 1,
        subsystem: 'database',
        level: 'error',
        message: 'migration failed',
      }),
    ).toBe('[database] ERROR migration failed')
  })

  it('dedup key ignores timestamp', () => {
    const message = 'app.renderer.ready {"version":"0.2.0-rc.6"}'
    const a = consoleDedupKey({
      at: 100,
      subsystem: 'provenance',
      level: 'info',
      message,
    })
    const b = consoleDedupKey({
      at: 200,
      subsystem: 'provenance',
      level: 'info',
      message,
    })
    expect(a).toBe(b)
  })
})
