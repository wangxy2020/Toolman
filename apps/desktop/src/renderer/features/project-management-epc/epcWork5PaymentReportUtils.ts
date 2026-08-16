/** Payment workflow report formatting — facade preserving original public exports. */

export type { StepFooterParts } from './epcWork5PaymentReportDiscovery'

export {
  EPC_WORK5_STEP1_INTRO,
  EPC_WORK5_STEP2_INTRO,
  EPC_WORK5_STEP3_INTRO,
  EPC_WORK5_STEP4_INTRO,
  EPC_WORK5_STEP5_INTRO,
  PAYMENT_ALIGNED_QUEUE_LABELS,
  formatDiscoveredAlignedMarkdown,
  formatDiscoveredAlignedSummaryTags,
  formatWork5Step1FooterLine,
  formatWork5Step1Section,
  getDiscoveredAlignedWorkbooks,
  getWork5Step1FooterParts,
  isWork5Step1ScanSuccess,
  sortDiscoveredAlignedForDisplay,
} from './epcWork5PaymentReportDiscovery'

export {
  WORK5_IDLE_STEPS_DETAIL,
  formatStep5OutputFilesMarkdown,
  formatWork5NarrationHints,
  formatWork5Steps2to5Markdown,
  formatWork5WorkflowStepFooterMarkdown,
  getWork5Step2FooterParts,
  getWork5Step3FooterParts,
  getWork5Step4FooterParts,
  getWork5Step5FooterParts,
  getWork5Step5OutputPaths,
  getWork5WorkflowStepFooterParts,
  getWork5WorkflowStepIntro,
  isWork5NoPendingIdleRun,
  work5RequiresDiagnosticAnalysis,
} from './epcWork5PaymentReportFooters'
