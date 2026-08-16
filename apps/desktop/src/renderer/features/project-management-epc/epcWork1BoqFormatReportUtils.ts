/** BOQ format workflow report utils — facade preserving original public exports. */

export {
  EPC_WORK1_STEP1_INTRO,
  EPC_WORK1_STEP2_INTRO,
  EPC_WORK1_STEP3_INTRO,
  EPC_WORK1_STEP4_INTRO,
  EPC_WORK1_STEP5_INTRO,
  WORK1_IDLE_STEPS_DETAIL,
  formatBoqFormatDiscoveredSummaryTags,
  formatBoqFormatDiscoveredTableHtml,
  formatWork1Step1FooterLine,
  formatWork1Step1Section,
  getWork1Step1FooterParts,
  getWork1WorkflowStepIntro,
  isWork1Step1ScanSuccess,
} from './epcWork1BoqFormatReportDiscovery'

export {
  formatWork1NarrationHints,
  formatWork1Step5OutputFilesMarkdown,
  formatWork1Steps2to5Markdown,
  formatWork1WorkflowStepFooterMarkdown,
  getWork1Step2FooterParts,
  getWork1Step3FooterParts,
  getWork1Step4FooterParts,
  getWork1Step5FooterParts,
  getWork1Step5OutputPaths,
  getWork1WorkflowStepFooterParts,
  isWork1NoPendingIdleRun,
  work1RequiresDiagnosticAnalysis,
} from './epcWork1BoqFormatReportFooters'
