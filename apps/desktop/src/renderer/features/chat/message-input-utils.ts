import type { KeyboardEvent } from 'react'
import type { SendShortcut } from './message-settings'
import type { TranslateFn } from '../../i18n/I18nProvider'

export function shouldSubmitOnEnter(
  event: KeyboardEvent<HTMLTextAreaElement>,
  sendShortcut: SendShortcut,
): boolean {
  const enter = event.key === 'Enter'
  const shift = event.shiftKey
  const ctrl = event.metaKey || event.ctrlKey

  if (sendShortcut === 'enter') {
    return enter && !shift
  }
  if (sendShortcut === 'ctrl+enter') {
    return enter && ctrl
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
  textarea: HTMLTextAreaElement,
  currentText: string,
  insertion: string,
): { nextText: string; cursor: number } {
  const start = textarea.selectionStart ?? currentText.length
  const end = textarea.selectionEnd ?? currentText.length
  const nextText = currentText.slice(0, start) + insertion + currentText.slice(end)
  return { nextText, cursor: start + insertion.length }
}
