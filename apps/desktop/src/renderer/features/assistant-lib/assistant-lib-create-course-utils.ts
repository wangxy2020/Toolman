import type { AssistantLibPresetId } from '@toolman/shared'
import type { AssistantLibTextbookSource } from './assistant-lib-form-utils'

export type AssistantLibCreateCourseInput = {
  courseName: string
  presetId: AssistantLibPresetId
  kbIds?: string[]
  textbookFilePaths?: string[]
  textbookSource: AssistantLibTextbookSource
}

export function validateCreateCourseDraft(options: {
  courseName: string
  presetId: AssistantLibPresetId
  textbookSource: AssistantLibTextbookSource
  selectedKbId: string
  filePaths: string[]
}):
  | { ok: true; input: AssistantLibCreateCourseInput }
  | { ok: false; errorKey: string } {
  const trimmedName = options.courseName.trim()
  if (!trimmedName) {
    return { ok: false, errorKey: 'assistantLibPage.courseNameRequired' }
  }

  if (options.textbookSource === 'knowledge') {
    if (!options.selectedKbId) {
      return { ok: false, errorKey: 'assistantLibPage.selectKbRequired' }
    }
    return {
      ok: true,
      input: {
        courseName: trimmedName,
        presetId: options.presetId,
        textbookSource: 'knowledge',
        kbIds: [options.selectedKbId],
      },
    }
  }

  if (options.filePaths.length === 0) {
    return { ok: false, errorKey: 'assistantLibPage.textbookFilesRequired' }
  }

  return {
    ok: true,
    input: {
      courseName: trimmedName,
      presetId: options.presetId,
      textbookSource: 'local',
      textbookFilePaths: options.filePaths,
    },
  }
}
