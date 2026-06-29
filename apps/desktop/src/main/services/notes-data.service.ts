export type { NotesSearchHit } from './notes-data/types'
export {
  getNotesData,
  getNotesDataJson,
  syncNotesData,
  upsertNoteItem,
  getNoteById,
} from './notes-data/storage'
export {
  noteToMarkdown,
  searchNotesData,
  readNoteData,
} from './notes-data/search'
export { ingestNotesToKnowledgeBase } from './notes-data/ingest'
