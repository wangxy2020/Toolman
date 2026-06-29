import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./local-operations.service', () => ({
  appendPersistentDiagnosticLine: vi.fn(),
}))

import { appendPersistentDiagnosticLine } from './local-operations.service'
import {
  clearDiagnosticEvents,
  listDiagnosticEvents,
  recordDiagnosticEvent,
} from './diagnostics-log'

describe('diagnostics-log', () => {
  beforeEach(() => {
    clearDiagnosticEvents()
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('records and lists diagnostic events', () => {
    recordDiagnosticEvent('p2p', 'info', 'sync started')
    const events = listDiagnosticEvents(10)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      subsystem: 'p2p',
      level: 'info',
      message: 'sync started',
    })
  })

  it('persists structured json lines', () => {
    recordDiagnosticEvent('auth', 'warn', 'token expiring')
    expect(appendPersistentDiagnosticLine).toHaveBeenCalledWith(
      expect.stringContaining('"subsystem":"auth"'),
    )
    expect(console.warn).toHaveBeenCalledWith('[auth] WARN token expiring')
  })

  it('prints friendly provenance lines to console', () => {
    recordDiagnosticEvent(
      'provenance',
      'info',
      'app.start {"gitCommit":"e6bbee4","version":"0.2.0-rc.6"}',
    )
    expect(console.info).toHaveBeenCalledWith(
      '[provenance] App started (v0.2.0-rc.6, commit e6bbee4)',
    )
  })

  it('deduplicates identical console lines within 1.5s', () => {
    recordDiagnosticEvent('provenance', 'info', 'app.renderer.ready {"version":"0.2.0-rc.6"}')
    recordDiagnosticEvent('provenance', 'info', 'app.renderer.ready {"version":"0.2.0-rc.6"}')
    expect(console.info).toHaveBeenCalledTimes(1)
  })

  it('clears buffered events', () => {
    recordDiagnosticEvent('app', 'error', 'boom')
    clearDiagnosticEvents()
    expect(listDiagnosticEvents()).toEqual([])
  })
})
