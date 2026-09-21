import type { KeyboardEvent } from 'react'
import type { SendShortcut } from './message-settings'
import type { TranslateFn } from '../../i18n/I18nProvider'

function isEnterKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  const key = event.key || event.nativeEvent.key
  if (key === 'Enter' || key === 'NumpadEnter') return true
  const code = event.keyCode || event.nativeEvent.keyCode || event.which
  return code === 13
}

function hasModKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return Boolean(
    event.metaKey ||
      event.ctrlKey ||
      event.getModifierState?.('Meta') ||
      event.getModifierState?.('Control') ||
      event.nativeEvent.metaKey ||
      event.nativeEvent.ctrlKey,
  )
}

export function shouldSubmitOnEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  sendShortcut: SendShortcut,
): boolean {
  const enter = isEnterKey(event)
  const shift = event.shiftKey || event.nativeEvent.shiftKey
  const mod = hasModKey(event)
  // ⌘/Ctrl+Enter always sends (settings shortcut list). Skip IME 229 while a
  // modifier is held — CJK IMEs on macOS otherwise swallow Command+Enter.
  if (enter && mod && !shift) return true
  if (event.nativeEvent.isComposing || event.keyCode === 229) return false

  if (sendShortcut === 'enter') {
    return enter && !shift
  }
  if (sendShortcut === 'ctrl+enter') {
    return enter && mod
  }
  return enter && shift
}

export function sendShortcutPlaceholder(sendShortcut: SendShortcut, t: (key: string) => string): string {
  if (sendShortcut === 'ctrl+enter') return t('chat.input.sendCtrlEnter')
  if (sendShortcut === 'shift+enter') return t('chat.input.sendShiftEnter')
  return t('chat.input.sendEnter')
}

export function buildMessageInputPlaceholder({
  disabled,
  toolbarMode,
  modelCount,
  sendShortcut,
  t,
}: {
  disabled: boolean
  toolbarMode: 'agent' | 'group'
  modelCount: number
  sendShortcut: SendShortcut
  t: TranslateFn
}): string {
  if (disabled) {
    return toolbarMode === 'group'
      ? t('chat.input.placeholderGroupReadonly')
      : t('chat.input.placeholderNoSession')
  }
  if (modelCount > 1) {
    return t('chat.input.placeholderMultiModel', { count: modelCount })
  }
  if (toolbarMode === 'group') {
    return t('chat.input.placeholderGroup', { shortcut: sendShortcutPlaceholder(sendShortcut, t) })
  }
  return t('chat.input.placeholderAgent', { shortcut: sendShortcutPlaceholder(sendShortcut, t) })
}

export function insertAtCursor(
  textarea: Pick<HTMLTextAreaElement, 'selectionStart' | 'selectionEnd'>,
  currentText: string,
  insertion: string,
): { nextText: string; cursor: number } {
  const start = textarea.selectionStart ?? currentText.length
  const end = textarea.selectionEnd ?? currentText.length
  const nextText = currentText.slice(0, start) + insertion + currentText.slice(end)
  return { nextText, cursor: start + insertion.length }
}

/** How long to ignore native input after send (system dictation often flushes late). */
export const POST_SEND_INPUT_SUPPRESS_MS = 450

/**
 * Prefer the live DOM value so system dictation is not lost before React state
 * catches up. If React already has text and the DOM is still empty, the controlled
 * `value` has not committed yet (emoji / phrase insert) — keep React text.
 */
export function readComposerText(
  textarea: HTMLTextAreaElement | null | undefined,
  reactText: string,
): string {
  const live = textarea?.value
  if (live == null) return reactText
  if (live.length === 0 && reactText.length > 0) return reactText
  return live
}

export function shouldIgnoreComposerInput(suppressUntilMs: number, nowMs = Date.now()): boolean {
  return nowMs < suppressUntilMs
}
