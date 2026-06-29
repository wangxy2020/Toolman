import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-test',
    getVersion: () => '0.2.0-rc.7',
  },
}))

vi.mock('./p2p/p2p-device-identity.service', () => ({
  getP2pDeviceId: () => '00000000-0000-4000-8000-000000000001',
}))

vi.mock('./structured-log.service', () => ({
  logStructured: vi.fn(),
}))

describe('copyright-provenance.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('records startup beacon with build fingerprint', async () => {
    const { bootstrapCopyrightProvenance, getProvenanceDiagnostics } = await import(
      './copyright-provenance.service'
    )
    bootstrapCopyrightProvenance()
    const diagnostics = getProvenanceDiagnostics()
    expect(diagnostics.buildFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(diagnostics.buildId).toHaveLength(16)
    expect(diagnostics.beaconCount).toBeGreaterThanOrEqual(1)
    expect(diagnostics.lastBeaconEvent).toBe('app.start')
  })

  it('does not duplicate one-shot beacons in the same process', async () => {
    const { bootstrapCopyrightProvenance, recordProvenanceBeacon, getProvenanceDiagnostics } =
      await import('./copyright-provenance.service')

    bootstrapCopyrightProvenance()
    bootstrapCopyrightProvenance()
    recordProvenanceBeacon('app.renderer.ready')
    recordProvenanceBeacon('app.renderer.ready')

    const diagnostics = getProvenanceDiagnostics()
    expect(diagnostics.beaconCount).toBe(2)
    expect(diagnostics.lastBeaconEvent).toBe('app.renderer.ready')
  })
})
