import {
  DOCX_MAX_CONTINUE_NUDGES,
  DOCX_MIN_EDITS_BEFORE_FINISH,
  DOCX_MIN_IDLE_ROUNDS_TO_FINISH,
} from './constants'

export function shouldContinueDocxEditing(options: {
  thorough: boolean
  successfulEdits: number
  idleRoundsWithoutTools: number
  continueNudgesSent: number
}): boolean {
  if (options.continueNudgesSent >= DOCX_MAX_CONTINUE_NUDGES) return false

  const minEdits = options.thorough ? DOCX_MIN_EDITS_BEFORE_FINISH : 1
  if (options.successfulEdits < minEdits) return true

  if (options.thorough && options.idleRoundsWithoutTools < DOCX_MIN_IDLE_ROUNDS_TO_FINISH) {
    return true
  }

  return false
}
