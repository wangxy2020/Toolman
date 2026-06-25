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
  })

  it('clears buffered events', () => {
    recordDiagnosticEvent('app', 'error', 'boom')
    clearDiagnosticEvents()
    expect(listDiagnosticEvents()).toEqual([])
  })
})
