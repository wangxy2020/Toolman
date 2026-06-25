import { describe, expect, it, vi } from 'vitest'

vi.mock('./diagnostics-log', () => ({
  recordDiagnosticEvent: vi.fn(),
}))

import { recordDiagnosticEvent } from './diagnostics-log'
import { appLog, logStructured } from './structured-log.service'

describe('structured-log.service', () => {
  it('records structured messages with optional context', () => {
    logStructured('p2p', 'info', 'connected', { peer: 'dev-1' })
    expect(recordDiagnosticEvent).toHaveBeenCalledWith(
      'p2p',
      'info',
      expect.stringContaining('"peer":"dev-1"'),
    )
  })

  it('exposes appLog helpers', () => {
    appLog.warn('startup delayed')
    expect(recordDiagnosticEvent).toHaveBeenCalledWith('app', 'warn', 'startup delayed')
  })
})
