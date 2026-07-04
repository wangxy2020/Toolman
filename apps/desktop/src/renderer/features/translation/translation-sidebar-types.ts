export type TranslationSidebarSection = 'contrast' | 'documents'

export const TRANSLATION_SIDEBAR_SECTIONS: Array<{
  id: TranslationSidebarSection
}> = [{ id: 'contrast' }, { id: 'documents' }]

export const DEFAULT_TRANSLATION_SECTION: TranslationSidebarSection = 'contrast'
