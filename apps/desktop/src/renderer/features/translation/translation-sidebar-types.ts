import { DEFAULT_TRANSLATION_FOLDER_ID } from './translation-storage'

/** Sidebar section id = translation folder id (default folder replaces legacy `'documents'`). */
export type TranslationSidebarSection = string

export const DEFAULT_TRANSLATION_SECTION: TranslationSidebarSection = DEFAULT_TRANSLATION_FOLDER_ID

/** Reserved legacy contrast mode — not shown as a folder in the sidebar. */
export function isTranslationDocumentsSection(section: TranslationSidebarSection): boolean {
  return section !== 'contrast'
}
