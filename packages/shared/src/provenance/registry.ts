import type { ProvenanceBeaconEvent } from '../ipc/provenance.js'

/**
 * Canonical integration map for build fingerprint, copyright metadata, and
 * session beacons. Extend this registry instead of adding parallel pipelines.
 */
export const TOOLMAN_ONE_SHOT_BEACON_EVENTS = [
  'app.start',
  'app.renderer.ready',
  'app.diagnostics.view',
  'app.about.view',
] as const satisfies readonly ProvenanceBeaconEvent[]

export const TOOLMAN_REPEATABLE_BEACON_EVENTS = ['app.session.heartbeat'] as const satisfies readonly ProvenanceBeaconEvent[]

export const TOOLMAN_PROVENANCE_REGISTRY = {
  copyright: {
    metaJson: 'packages/shared/src/provenance/copyright.meta.json',
    constants: 'packages/shared/src/provenance/copyright.ts',
  },
  buildFingerprint: {
    generator: 'scripts/write-build-provenance.mjs',
    artifact: 'packages/shared/src/provenance/build-provenance.generated.ts',
    npmScript: 'provenance:generate',
  },
  beacons: {
    schema: 'packages/shared/src/ipc/provenance.ts',
    mainService: 'apps/desktop/src/main/services/copyright-provenance.service.ts',
    ipcChannel: 'AppProvenanceBeacon',
    oneShotEvents: TOOLMAN_ONE_SHOT_BEACON_EVENTS,
    repeatableEvents: TOOLMAN_REPEATABLE_BEACON_EVENTS,
    rendererHelper: 'apps/desktop/src/renderer/lib/record-provenance-beacon.ts',
    callSites: {
      appStart: 'bootstrapCopyrightProvenance() — apps/desktop/src/main/index.ts',
      rendererReady: 'ProvenanceBootstrap — apps/desktop/src/renderer/main.tsx',
      diagnosticsView: 'useDiagnosticsSettings.ts',
      aboutView: 'AboutSettingsPanel.tsx',
    },
    logFile: '{userData}/diagnostics/provenance.jsonl',
  },
  fileHeaders: {
    template: 'TOOLMAN_COPYRIGHT_HEADER in packages/shared/src/provenance/copyright.ts',
    entryPoints: [
      'apps/desktop/src/main/index.ts',
      'apps/desktop/src/renderer/main.tsx',
      'apps/desktop/src/renderer/index.html (meta copyright)',
    ],
  },
} as const
