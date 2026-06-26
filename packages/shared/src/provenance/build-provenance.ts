import { TOOLMAN_BUILD_PROVENANCE } from './build-provenance.generated.js'
import { ToolmanBuildProvenanceSchema, type ToolmanBuildProvenance } from '../ipc/provenance.js'

export type ToolmanBuildProvenanceSnapshot = ToolmanBuildProvenance

export { TOOLMAN_BUILD_PROVENANCE }

export function getToolmanBuildProvenance(): ToolmanBuildProvenanceSnapshot {
  return ToolmanBuildProvenanceSchema.parse(TOOLMAN_BUILD_PROVENANCE)
}
