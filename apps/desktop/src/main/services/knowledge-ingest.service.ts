export type { IngestFileAtPathOptions, IngestFileAtPathResult } from './knowledge-ingest-shared'

export { refreshKbStats } from './knowledge-ingest-shared'

export { ingestFileAtPath } from './knowledge-ingest-file'

export { ingestUrlDocument } from './knowledge-ingest-url'

export {
  prepareIngestQueue,
  startIngestFilePathsInBackground,
  ingestFilePaths,
} from './knowledge-ingest-queue'

export {
  reconcileStuckLocalFilesDocuments,
  recoverInterruptedIngestJobsOnStartup,
  reconcileProcessingDocumentsWithoutIngestJob,
  recoverStaleIngestJobs,
  restoreIndexedDocumentsNotInFlight,
  purgeIgnoredKnowledgeDocuments,
} from './knowledge-ingest-recovery'

export {
  purgeIndexedDocument,
  handleRemovedFile,
  reindexDocument,
  reindexKnowledgeBase,
  startReindexDocumentInBackground,
  startReindexKnowledgeBaseInBackground,
} from './knowledge-ingest-reindex'
