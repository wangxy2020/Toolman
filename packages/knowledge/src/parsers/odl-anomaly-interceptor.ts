export {
  DEFAULT_ODL_ANOMALY_DETECTION_CONFIG,
  findMaxConsecutiveDuplicateRun,
  computeTextEntropy,
  computeUniqueCharRatio,
  detectOdlPageAnomaly,
  type OdlAnomalyDetectionConfig,
  type OdlAnomalyReason,
  type OdlAnomalyDetectionResult,
  type OdlAnomalyInterceptResult,
} from './odl-anomaly-detect.js'

export {
  stripConsecutiveDuplicateNoise,
  salvageOdlPageText,
  interceptOdlPageAnomaly,
  interceptOdlDocumentPages,
  buildMockOcrCollapsePageText,
  type OdlPageWithAnomalyMeta,
} from './odl-anomaly-intercept.js'
