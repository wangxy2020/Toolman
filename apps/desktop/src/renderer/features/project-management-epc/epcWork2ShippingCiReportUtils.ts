/** Shipping CI workflow report utils — facade preserving original public exports. */

export {
  EPC_WORK2_STEP1_INTRO,
  EPC_WORK2_STEP2_INTRO,
  EPC_WORK2_STEP3_INTRO,
  EPC_WORK2_STEP4_INTRO,
  EPC_WORK2_STEP5_INTRO,
  WORK2_IDLE_STEPS_DETAIL,
  formatShippingCiDiscoveredSummaryTags,
  formatShippingCiDiscoveredTableHtml,
  formatWork2Step1Section,
  formatWork2Step2FileLine,
  formatWork2Step2MismatchTableHtml,
  getWork2Step1FooterParts,
  getWork2WorkflowStepIntro,
  isWork2Step1ScanSuccess,
} from './epcWork2ShippingCiReportDiscovery'

export {
  formatWork2NarrationHints,
  formatWork2Step2ExtraLines,
  formatWork2Step5OutputFilesMarkdown,
  formatWork2Steps2to5Markdown,
  formatWork2WorkflowStepFooterMarkdown,
  getWork2Step2FooterParts,
  getWork2Step3FooterParts,
  getWork2Step4FooterParts,
  getWork2Step5FooterParts,
  getWork2WorkflowStepFooterParts,
  hasWork2Step2ComparableSuccess,
  isWork2NoPendingIdleRun,
  work2RequiresDiagnosticAnalysis,
} from './epcWork2ShippingCiReportFooters'
