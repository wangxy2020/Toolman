export type { OfficeToDocxMethod, OfficeConversionCapabilities } from './office-to-docx/types'
export { OfficeToDocxError } from './office-to-docx/types'
export {
  isNativeDocxPath,
  isLegacyWordPath,
  hasMicrosoftWordInstalled,
  hasFormatPreservingConverter,
  shouldAllowPlaintextFallback,
  docxWorkingStem,
  resolveOfficeSourceKind,
  buildLegacyWordConversionStatusMessage,
  ensureNamedSourceForConversion,
} from './office-to-docx/path-helpers'
export { detectOfficeConversionCapabilities } from './office-to-docx/materialize'
export { findMicrosoftWordMac } from './office-to-docx/microsoft-word'
export { buildMicrosoftWordMacConversionScript } from './office-to-docx/microsoft-word'
export { materializeDocxForMcp } from './office-to-docx/materialize'
